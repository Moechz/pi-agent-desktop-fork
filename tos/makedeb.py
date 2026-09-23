#!/usr/bin/env python3
"""极简 deb 打包器（不依赖 dpkg / docker，macOS 与 Linux 通用）。

deb = ar 归档，依次包含三个成员：
  1. debian-binary   "2.0\\n"
  2. control.tar.gz  ./control ./preinst ./postinst ./prerm ./postrm ./md5sums
  3. data.tar.xz     文件系统树（uid=gid=0、mtime=0，避免构建机污染 —— 指南坑 8）

用法：
  makedeb.py --pkgroot <树> --assets <模板目录> --out <out.deb> \\
             --version <v> --arch <amd64|arm64> --maintainer "Name <mail>" \\
             --control-template <control.in> --vars <k=v文件>
"""
from __future__ import annotations

import argparse
import gzip
import io
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile

SCRIPT_MODE = 0o755
FILE_MODE = 0o644


def load_vars(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def substitute(text: str, values: dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in values:
            raise SystemExit(f"缺少模板变量 {key}")
        return values[key]

    text = re.sub(r"@@([A-Z0-9_]+)@@", repl, text)
    # 兼容脚本里更省字的写法 @VERSION@（不与 @@ 形式冲突）
    return re.sub(r"(?<!@)@([A-Z0-9_]+)@(?!@)", repl, text)


def add_bytes(tar: tarfile.TarFile, name: str, data: bytes, mode: int) -> None:
    info = tarfile.TarInfo(name=name)
    info.size = len(data)
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = info.gname = "root"
    info.mtime = 0
    tar.addfile(info, io.BytesIO(data))


def add_tree(tar: tarfile.TarFile, root: pathlib.Path) -> None:
    """把目录树加入 data 包：路径带 ./ 前缀、属主 root:root、mtime 归零。"""
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        arcname = f"./{rel.as_posix()}"
        stat = path.lstat()
        if path.is_symlink():
            info = tarfile.TarInfo(name=arcname)
            info.type = tarfile.SYMTYPE
            info.linkname = os.readlink(path)
            info.uid = info.gid = 0
            info.uname = info.gname = "root"
            info.mtime = 0
            tar.addfile(info)
            continue
        if path.is_dir():
            info = tarfile.TarInfo(name=arcname.rstrip("/") + "/")
            info.type = tarfile.DIRTYPE
            info.mode = stat.st_mode & 0o7777
            info.uid = info.gid = 0
            info.uname = info.gname = "root"
            info.mtime = 0
            tar.addfile(info)
            continue
        info = tarfile.TarInfo(name=arcname)
        info.size = stat.st_size
        info.mode = stat.st_mode & 0o7777
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        info.mtime = 0
        with path.open("rb") as handle:
            tar.addfile(info, handle)


def md5_of(path: pathlib.Path) -> str:
    import hashlib

    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pkgroot", required=True)
    parser.add_argument("--assets", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--arch", required=True)
    parser.add_argument("--maintainer", required=True)
    parser.add_argument("--control-template", required=True)
    parser.add_argument("--vars", required=True, help="key=value 文件（供模板替换）")
    args = parser.parse_args()

    pkgroot = pathlib.Path(args.pkgroot).resolve()
    assets = pathlib.Path(args.assets).resolve()
    out = pathlib.Path(args.out).resolve()
    if not pkgroot.is_dir():
        raise SystemExit(f"pkgroot 不存在: {pkgroot}")

    values = load_vars(pathlib.Path(args.vars))
    values.update({"VERSION": args.version, "ARCH": args.arch, "MAINTAINER": args.maintainer})

    # 数据包体积 → Installed-Size（KB）
    installed_kb = 0
    for path in pkgroot.rglob("*"):
        if path.is_file() and not path.is_symlink():
            installed_kb += path.lstat().st_size
    values["SIZE"] = str(max(1, installed_kb // 1024))

    # ---- control ----
    control_text = substitute(pathlib.Path(args.control_template).read_text(encoding="utf-8"), values)
    if not control_text.endswith("\n"):
        control_text += "\n"
    # dpkg 的 control 不支持注释行：出现非 Field/延续行即立刻失败
    for line in control_text.splitlines():
        if line.startswith("#"):
            raise SystemExit(f"control 含非法注释行: {line}")

    control_files: list[tuple[str, bytes, int]] = [("./control", control_text.encode(), FILE_MODE)]
    for script in ("preinst", "postinst", "prerm", "postrm"):
        src = assets / script
        if src.exists():
            body = substitute(src.read_text(encoding="utf-8"), values).encode()
            control_files.append((f"./{script}", body, SCRIPT_MODE))

    # md5sums：数据树里所有普通文件
    sums: list[str] = []
    for path in sorted(pkgroot.rglob("*")):
        if path.is_file() and not path.is_symlink():
            rel = path.relative_to(pkgroot).as_posix()
            sums.append(f"{md5_of(path)}  {rel}")
    control_files.append(("./md5sums", ("\n".join(sums) + "\n").encode() if sums else b"", FILE_MODE))

    # ---- 三个成员必须用 Debian 规定的**固定名字**（dpkg 按名字定位，长名会被拒）----
    work = pathlib.Path(out.parent) / f".{out.stem}.build"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    (work / "debian-binary").write_bytes(b"2.0\n")

    with tarfile.open(work / "control.tar.gz", "w:gz", format=tarfile.GNU_FORMAT) as tar:
        for name, body, mode in control_files:
            add_bytes(tar, name, body, mode)

    with tarfile.open(work / "data.tar.xz", "w:xz", format=tarfile.GNU_FORMAT) as tar:
        add_tree(tar, pkgroot)

    if out.exists():
        out.unlink()
    subprocess.run(
        ["ar", "rc", out.name, "debian-binary", "control.tar.gz", "data.tar.xz"],
        cwd=work,
        check=True,
    )
    shutil.move(str(work / out.name), str(out))
    shutil.rmtree(work, ignore_errors=True)

    print(f"✅ deb 已产出: {out}  ({out.stat().st_size / 1048576:.1f} MB, Installed-Size {values['SIZE']} KB)")
    print(f"   校验: dpkg-deb --info / --contents 或 ar t {out.name}")


if __name__ == "__main__":
    main()
