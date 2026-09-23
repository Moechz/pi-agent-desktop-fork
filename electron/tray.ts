import { app, Menu, Tray, BrowserWindow, nativeImage } from "electron";
import { setQuitting } from "./main";
import { getAppIconPath } from "./app-icon";
import { mainT, type MainLocale } from "./i18n";

const FALLBACK_ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVQ4y2N" +
    "kwAT/GYYBYwYDAKLuAf8LSXNHAAAAABJRU5ErkJggg==",
  "base64"
);

function buildTrayMenu(mainWindow: BrowserWindow, locale: MainLocale): Menu {
  return Menu.buildFromTemplate([
    {
      label: mainT("tray.showWindow", locale),
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: "separator" },
    {
      label: mainT("tray.quit", locale),
      click: () => {
        setQuitting(true);
        app.quit();
      },
    },
  ]);
}

/** 语言切换时重建托盘菜单（复用同一 Tray 实例） */
export function updateTrayMenu(tray: Tray, mainWindow: BrowserWindow, locale: MainLocale): void {
  tray.setContextMenu(buildTrayMenu(mainWindow, locale));
}

export function createTray(mainWindow: BrowserWindow, locale: MainLocale = "en"): Tray {
  const iconPath = getAppIconPath(app.getAppPath());

  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fallback: create a minimal 16x16 transparent PNG
      icon = nativeImage.createFromBuffer(FALLBACK_ICON_PNG);
    }
  } catch {
    icon = nativeImage.createFromBuffer(FALLBACK_ICON_PNG);
  }

  const tray = new Tray(icon);
  tray.setToolTip("Pi Agent Desktop");

  tray.setContextMenu(buildTrayMenu(mainWindow, locale));
  tray.on("double-click", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
