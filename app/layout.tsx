import type { Metadata } from "next";
import { Noto_Sans_Mono, Inter } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/components/I18nProvider";
import GlobalRuntimeErrorReporter from "@/components/GlobalRuntimeErrorReporter";
import { InsecureContextNotice } from "@/components/InsecureContextNotice";
import { APP_NAME } from "@/lib/app-identity.ts";
import { ICON_BASES, iconUrl } from "@/lib/app-icons.ts";
import { BASE_PATH } from "@/lib/base-path.ts";
import { resolveRuntimeTag, runtimeBootstrapScript } from "@/lib/runtime-env.ts";

// 构建期即可判定的宿主类型：TOS 部署带 basePath。Electron 只能在客户端识别（见 bootstrap 脚本）。
const serverRuntimeTag = resolveRuntimeTag({
  electronUserAgent: false,
  electronBridge: false,
  tosBasePath: BASE_PATH !== "",
});

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-noto-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  // 图标 URL 带内容哈希：图标一改 URL 就变，浏览器（尤其 Safari）的图标缓存无法再残留旧图标
  // 图标：URL 不带查询串（Safari 不认带 ? 的图标），哈希放在文件名里（缓存仍然会失效）
  // 顺序上把 .ico 放最前 —— Safari 对 multi-size .ico 最稳，否则会回退去取站点根的 /favicon.ico
  icons: {
    icon: [
      { url: iconUrl({ ...ICON_BASES.favicon, basePath: BASE_PATH }), sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: iconUrl({ ...ICON_BASES.icon, basePath: BASE_PATH }), sizes: "512x512", type: "image/png" },
    ],
    shortcut: iconUrl({ ...ICON_BASES.favicon, basePath: BASE_PATH }),
    apple: [
      { url: iconUrl({ ...ICON_BASES.apple, basePath: BASE_PATH }), sizes: "180x180", type: "image/png" },
    ],
  },
  description: "Pi Coding Agent Desktop Application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${notoSansMono.variable} ${inter.variable}`}
      data-runtime={serverRuntimeTag}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`,
          }}
        />
        {/* 宿主标记要在首帧前落地，否则 CSS 会先按错误标记渲染一帧 */}
        <script dangerouslySetInnerHTML={{ __html: runtimeBootstrapScript(serverRuntimeTag) }} />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <I18nProvider>
          {/* Window-level unhandledrejection/error net; inside the provider so the toast copy can be translated. */}
          <GlobalRuntimeErrorReporter />
          {/* 明文 HTTP 部署下提示可切换 HTTPS 入口（非安全上下文会整体削弱浏览器能力） */}
          <InsecureContextNotice />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
