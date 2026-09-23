#!/usr/bin/env python3
"""生成 TOS 应用语言文件 piagentfortos.lang（23 语超集，覆盖官方两个 14 语口径）。

未翻译节点按指南要求填英文（官方自动校验只查必需节点存在性）。
zh-cn / zh-hk 为完整中文文案，其余语言为英文文案。
"""
import pathlib

LANGS = [
    "zh-cn", "zh-hk", "en-us", "fr-fr", "de-de", "it-it", "es-es", "hu-hu", "ja-jp",
    "ko-kr", "pl-pl", "ru-ru", "tr-tr", "pt-pt", "ar-sa", "cs-cz", "he-il", "id-id",
    "nb-no", "nl-nl", "sv-se", "th-th", "vi-vn",
]

NAME = "Pi Agent for TOS"
AUTH = "Pi Agent Desktop"  # 指南坑 49：auth 填上游项目/作者语义；publisher 在 config.ini=Moechz

EN = {
    "descript": (
        "Pi Agent Desktop is the desktop client for the pi coding agent; this package runs it as a TOS web "
        "application. The app listens on loopback only and opens from the TOS desktop in a new browser tab via "
        "the platform route /piagentfortos/ - no extra port is exposed. Because TOS has no Node runtime, this "
        "package ships a pinned Node runtime plus the ripgrep/fd search tools and image-processing native module, "
        "so everything works offline right after install. Sessions, long-term memory and workspaces live on the "
        "data volume, the service runs as a dedicated unprivileged user in a hardened systemd sandbox, and the "
        "folder picker reuses the official TOS file-management API so permissions stay under TOS control."
    ),
    "release_note": (
        "Ships Pi Agent Desktop built from the public source of this repository together with a pinned Node "
        "runtime (see PROVENANCE.md in the app directory for exact versions and SHA-256 pins). After install, "
        "open the app from the TOS desktop, configure your model provider (API key) in the settings panel, and "
        "pick a project folder - the folder picker is backed by the official TOS file-management API. "
        "Note: git is a dependency of this package (install it from your package manager if it is missing)."
    ),
    "important": (
        "Data (sessions, long-term memory, workspaces) is stored on the data volume under "
        "/Volume*/@apps/piagentfortos/data; 'apt remove' keeps it and 'apt purge' deletes it. The web UI has no "
        "default password, but the service is reachable only through the TOS web route /piagentfortos/ - it does "
        "not open any external port."
    ),
}

ZH_CN = {
    "descript": (
        "Pi Agent Desktop 是 pi 编程智能体的桌面客户端；本包把它作为 TOS 网页应用提供：应用只监听本机回环，"
        "从 TOS 桌面以新标签页方式经平台路由 /piagentfortos/ 打开，不额外对外暴露任何端口。由于 TOS 基座没有 "
        "Node 运行时，本包内置固定版本的 Node 运行时，以及 ripgrep / fd 搜索工具与图像处理原生模块，安装后离线即可用。"
        "会话、长期记忆与工作区数据保存在数据卷上；服务以专用非特权用户运行并施加 systemd 沙箱加固；"
        "选择工作目录复用 TOS 官方文件管理 API，权限由 TOS 统一管控。"
    ),
    "release_note": (
        "内置由本仓库公开源码构建的 Pi Agent Desktop，并携带固定版本的 Node 运行时（精确版本与 SHA-256 "
        "见应用目录下的 PROVENANCE.md）。安装后从 TOS 桌面打开应用，在设置面板里配置模型服务（API 密钥），"
        "再选择一个项目目录即可开始——目录选择由 TOS 官方文件管理 API 提供。注意：本包依赖 git，"
        "若系统未安装请用包管理器安装。"
    ),
    "important": (
        "会话、长期记忆与工作区数据保存在数据卷 /Volume*/@apps/piagentfortos/data：apt remove 卸载时保留，"
        "apt purge 会彻底删除。界面没有默认密码，但服务只能经 TOS 网页路由 /piagentfortos/ 访问，不开放任何对外端口。"
    ),
}

ZH_HK = {
    "descript": (
        "Pi Agent Desktop 是 pi 編程智能體的桌面用戶端；本包將它作為 TOS 網頁應用提供：應用只監聽本機回環，"
        "從 TOS 桌面以新分頁方式經平台路由 /piagentfortos/ 開啟，不額外對外暴露任何連接埠。由於 TOS 基座沒有 "
        "Node 執行環境，本包內建固定版本的 Node 執行環境，以及 ripgrep / fd 搜尋工具與影像處理原生模組，安裝後離線即可使用。"
        "工作階段、長期記憶與工作區資料保存在資料卷上；服務以專用非特權使用者執行並施加 systemd 沙箱強化；"
        "選擇工作目錄沿用 TOS 官方檔案管理 API，權限由 TOS 統一管控。"
    ),
    "release_note": (
        "內建由本倉庫公開原始碼建置的 Pi Agent Desktop，並攜帶固定版本的 Node 執行環境（精確版本與 SHA-256 "
        "見應用目錄下的 PROVENANCE.md）。安裝後從 TOS 桌面開啟應用，在設定面板裡設定模型服務（API 金鑰），"
        "再選擇一個專案目錄即可開始——目錄選擇由 TOS 官方檔案管理 API 提供。注意：本包相依 git，"
        "若系統未安裝請以套件管理器安裝。"
    ),
    "important": (
        "工作階段、長期記憶與工作區資料保存在資料卷 /Volume*/@apps/piagentfortos/data：apt remove 移除時保留，"
        "apt purge 會徹底刪除。介面沒有預設密碼，但服務只能經 TOS 網頁路由 /piagentfortos/ 存取，不開放任何對外連接埠。"
    ),
}


def render() -> str:
    blocks = []
    for lang in LANGS:
        text = ZH_CN if lang == "zh-cn" else ZH_HK if lang == "zh-hk" else EN
        blocks.append(
            "\n".join(
                [
                    f"[{lang}]",
                    f'name         = "{NAME}"',
                    f'auth         = "{AUTH}"',
                    'version      = "@@VERSION@@"',
                    f'descript     = "{text["descript"]}"',
                    f'release_note = "{text["release_note"]}"',
                    f'important    = "{text["important"]}"',
                ]
            )
        )
    return "\n\n".join(blocks) + "\n"


if __name__ == "__main__":
    target = pathlib.Path(__file__).resolve().parent / "assets" / "piagentfortos.lang"
    target.write_text(render(), encoding="utf-8")
    print(f"✅ 已生成 {target}（{len(LANGS)} 种语言，{len(target.read_text(encoding='utf-8'))} 字符）")
