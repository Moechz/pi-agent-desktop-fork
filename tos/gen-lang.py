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
AUTH = "Earendil Works"  # 指南坑 49：auth 填上游作者（这里是 pi 编码代理的作者组织
#  earendil-works，包 author 字段 = Mario Zechner）；publisher 在 config.ini=Moechz（打包者）

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


# 各语种的「官方要求字段」（descript / release_note / important）翻译。
# 未列出的语种回退到英文（EN）。技术名词保持原样：Pi Agent Desktop / TOS / Node / ripgrep / fd /
# systemd / PROVENANCE.md / /piagentfortos/ / /Volume*/@apps/piagentfortos/data / apt remove / apt purge / API / MIT。
TEXTS: dict[str, dict[str, str]] = {
    "en-us": EN,
    "zh-cn": ZH_CN,
    "zh-hk": ZH_HK,
    "fr-fr": {
        "descript": (
            "Pi Agent Desktop est le client de bureau de l'agent de codage pi ; ce paquet l'exécute comme "
            "application web TOS. L'application n'écoute que sur la boucle locale et s'ouvre depuis le bureau "
            "TOS dans un nouvel onglet du navigateur via la route /piagentfortos/ — aucun port supplémentaire "
            "n'est exposé. TOS n'ayant pas de runtime Node, ce paquet embarque un runtime Node à version figée, "
            "les outils de recherche ripgrep/fd et le module natif de traitement d'image : tout fonctionne hors "
            "ligne dès l'installation. Les sessions, la mémoire à long terme et les espaces de travail résident "
            "sur le volume de données, le service tourne sous un utilisateur dédié non privilégié dans un bac à "
            "sable systemd renforcé, et le sélecteur de dossier réutilise l'API officielle de gestion de fichiers "
            "de TOS, de sorte que les permissions restent sous le contrôle de TOS."
        ),
        "release_note": (
            "Fournit Pi Agent Desktop construit à partir du code source public de ce dépôt, accompagné d'un "
            "runtime Node à version figée (versions exactes et empreintes SHA-256 dans PROVENANCE.md, dans le "
            "répertoire de l'application). Après l'installation, ouvrez l'application depuis le bureau TOS, "
            "configurez votre fournisseur de modèle (clé API) dans le panneau des réglages, puis choisissez un "
            "dossier de projet — le sélecteur s'appuie sur l'API officielle de gestion de fichiers de TOS. "
            "Remarque : git est une dépendance de ce paquet (installez-le avec votre gestionnaire de paquets "
            "s'il est absent)."
        ),
        "important": (
            "Les données (sessions, mémoire à long terme, espaces de travail) sont stockées sur le volume de "
            "données sous /Volume*/@apps/piagentfortos/data ; « apt remove » les conserve et "
            "« apt purge » les supprime. L'interface web n'a pas de mot de passe par défaut, mais le service "
            "n'est joignable que via la route web TOS /piagentfortos/ — aucun port externe n'est ouvert."
        ),
    },
    "de-de": {
        "descript": (
            "Pi Agent Desktop ist der Desktop-Client für den Coding-Agenten pi; dieses Paket stellt ihn als "
            "TOS-Webanwendung bereit. Die Anwendung lauscht ausschließlich auf der Loopback-Schnittstelle und "
            "wird vom TOS-Desktop über die Plattform-Route /piagentfortos/ in einem neuen Browser-Tab geöffnet — "
            "ein zusätzlicher Port wird nicht nach außen geöffnet. Da TOS keine Node-Laufzeit besitzt, bringt "
            "dieses Paket eine versionierte Node-Laufzeit, die Suchwerkzeuge ripgrep/fd und das native Modul zur "
            "Bildverarbeitung mit; alles funktioniert direkt nach der Installation offline. Sitzungen, "
            "Langzeitgedächtnis und Arbeitsbereiche liegen auf dem Datenvolume, der Dienst läuft als eigener "
            "unprivilegierter Benutzer in einer gehärteten systemd-Sandbox, und die Ordnerauswahl nutzt die "
            "offizielle Dateiverwaltungs-API von TOS, sodass die Berechtigungen unter TOS-Kontrolle bleiben."
        ),
        "release_note": (
            "Enthält Pi Agent Desktop, gebaut aus dem öffentlichen Quellcode dieses Repositories, zusammen mit "
            "einer versionierten Node-Laufzeit (exakte Versionen und SHA-256-Prüfsummen in PROVENANCE.md im "
            "Anwendungsverzeichnis). Öffnen Sie die Anwendung nach der Installation vom TOS-Desktop aus, "
            "konfigurieren Sie im Einstellungsbereich Ihren Modellanbieter (API-Schlüssel) und wählen Sie einen "
            "Projektordner — die Ordnerauswahl basiert auf der offiziellen Dateiverwaltungs-API von TOS. Hinweis: "
            "git ist eine Abhängigkeit dieses Pakets (bei Bedarf mit der Paketverwaltung nachinstallieren)."
        ),
        "important": (
            "Daten (Sitzungen, Langzeitgedächtnis, Arbeitsbereiche) liegen auf dem Datenvolume unter "
            "/Volume*/@apps/piagentfortos/data; „apt remove“ behält sie, „apt purge“ löscht sie. Die Weboberfläche "
            "hat kein Standardpasswort, der Dienst ist jedoch nur über die TOS-Web-Route /piagentfortos/ "
            "erreichbar — nach außen wird kein Port geöffnet."
        ),
    },
    "es-es": {
        "descript": (
            "Pi Agent Desktop es el cliente de escritorio del agente de programación pi; este paquete lo "
            "ejecuta como aplicación web de TOS. La aplicación solo escucha en la interfaz local y se abre desde "
            "el escritorio de TOS en una pestaña nueva del navegador mediante la ruta /piagentfortos/ — no se "
            "expone ningún puerto adicional. Como TOS no incluye un entorno de ejecución Node, este paquete "
            "incorpora un Node de versión fijada, las herramientas de búsqueda ripgrep/fd y el módulo nativo de "
            "tratamiento de imágenes: todo funciona sin conexión justo después de instalar. Las sesiones, la "
            "memoria a largo plazo y los espacios de trabajo se guardan en el volumen de datos, el servicio se "
            "ejecuta con un usuario dedicado sin privilegios dentro de una sandbox systemd reforzada, y el "
            "selector de carpetas reutiliza la API oficial de gestión de archivos de TOS, de modo que los "
            "permisos siguen bajo el control de TOS."
        ),
        "release_note": (
            "Incluye Pi Agent Desktop compilado a partir del código fuente público de este repositorio junto con "
            "un Node de versión fijada (versiones exactas y sumas SHA-256 en PROVENANCE.md, en el directorio de "
            "la aplicación). Tras instalar, abra la aplicación desde el escritorio de TOS, configure su proveedor "
            "de modelo (clave de API) en el panel de ajustes y elija una carpeta de proyecto — el selector se "
            "apoya en la API oficial de gestión de archivos de TOS. Nota: git es una dependencia de este paquete "
            "(instálelo con su gestor de paquetes si falta)."
        ),
        "important": (
            "Los datos (sesiones, memoria a largo plazo, espacios de trabajo) se guardan en el volumen de datos, "
            "en /Volume*/@apps/piagentfortos/data; «apt remove» los conserva y «apt purge» los elimina. La "
            "interfaz web no tiene contraseña predeterminada, pero el servicio solo es accesible por la ruta web "
            "de TOS /piagentfortos/ — no abre ningún puerto externo."
        ),
    },
    "it-it": {
        "descript": (
            "Pi Agent Desktop è il client desktop per l'agente di programmazione pi; questo pacchetto lo esegue "
            "come applicazione web di TOS. L'applicazione ascolta solo sull'interfaccia di loopback e si apre dal "
            "desktop di TOS in una nuova scheda del browser tramite la rotta /piagentfortos/ — non viene esposta "
            "nessuna porta aggiuntiva. Poiché TOS non dispone di un runtime Node, questo pacchetto include un "
            "runtime Node con versione bloccata, gli strumenti di ricerca ripgrep/fd e il modulo nativo per "
            "l'elaborazione delle immagini: tutto funziona offline subito dopo l'installazione. Sessioni, memoria a "
            "lungo termine e spazi di lavoro risiedono sul volume dati, il servizio gira come utente dedicato non "
            "privilegiato in una sandbox systemd rafforzata e il selettore di cartelle riutilizza l'API ufficiale di "
            "gestione file di TOS, così i permessi restano sotto il controllo di TOS."
        ),
        "release_note": (
            "Include Pi Agent Desktop compilato dal codice sorgente pubblico di questo repository insieme a un "
            "runtime Node con versione bloccata (versioni esatte e impronte SHA-256 in PROVENANCE.md, nella "
            "cartella dell'applicazione). Dopo l'installazione apri l'applicazione dal desktop di TOS, configura il "
            "provider del modello (chiave API) nel pannello delle impostazioni e scegli una cartella di progetto — "
            "il selettore si basa sull'API ufficiale di gestione file di TOS. Nota: git è una dipendenza di questo "
            "pacchetto (installalo con il gestore di pacchetti se manca)."
        ),
        "important": (
            "I dati (sessioni, memoria a lungo termine, spazi di lavoro) sono salvati sul volume dati in "
            "/Volume*/@apps/piagentfortos/data; «apt remove» li conserva e «apt purge» li elimina. L'interfaccia "
            "web non ha password predefinita, ma il servizio è raggiungibile solo tramite la rotta web di TOS "
            "/piagentfortos/ — non apre alcuna porta esterna."
        ),
    },
    "pt-pt": {
        "descript": (
            "O Pi Agent Desktop é o cliente de ambiente de trabalho para o agente de programação pi; este pacote "
            "executa-o como aplicação web do TOS. A aplicação escuta apenas na interface local e abre-se a partir "
            "do ambiente de trabalho do TOS num novo separador do navegador através da rota /piagentfortos/ — não "
            "é exposta qualquer porta adicional. Como o TOS não inclui um runtime Node, este pacote traz um Node "
            "com versão fixada, as ferramentas de pesquisa ripgrep/fd e o módulo nativo de processamento de "
            "imagem: tudo funciona offline logo após a instalação. As sessões, a memória de longo prazo e os "
            "espaços de trabalho ficam no volume de dados, o serviço corre como utilizador dedicado sem "
            "privilégios numa sandbox systemd reforçada, e o seletor de pastas reutiliza a API oficial de gestão "
            "de ficheiros do TOS, mantendo as permissões sob controlo do TOS."
        ),
        "release_note": (
            "Inclui o Pi Agent Desktop compilado a partir do código-fonte público deste repositório, juntamente "
            "com um Node com versão fixada (versões exatas e resumos SHA-256 em PROVENANCE.md, na pasta da "
            "aplicação). Após instalar, abra a aplicação a partir do ambiente de trabalho do TOS, configure o "
            "fornecedor do modelo (chave de API) no painel de definições e escolha uma pasta de projeto — o "
            "seletor assenta na API oficial de gestão de ficheiros do TOS. Nota: o git é uma dependência deste "
            "pacote (instale-o com o gestor de pacotes caso falte)."
        ),
        "important": (
            "Os dados (sessões, memória de longo prazo, espaços de trabalho) ficam no volume de dados em "
            "/Volume*/@apps/piagentfortos/data; «apt remove» conserva-os e «apt purge» elimina-os. A interface web "
            "não tem palavra-passe predefinida, mas o serviço só é acessível pela rota web do TOS "
            "/piagentfortos/ — não abre qualquer porta externa."
        ),
    },
    "nl-nl": {
        "descript": (
            "Pi Agent Desktop is de desktopclient voor de programmeeragent pi; dit pakket levert hem als "
            "TOS-webapplicatie. De applicatie luistert alleen op de loopback-interface en wordt vanaf het "
            "TOS-bureaublad geopend in een nieuw browsertabblad via de platformroute /piagentfortos/ — er wordt "
            "geen extra poort naar buiten opengezet. Omdat TOS geen Node-runtime heeft, bevat dit pakket een Node "
            "met vastgezette versie, de zoekhulpmiddelen ripgrep/fd en de native module voor beeldverwerking; "
            "alles werkt direct na installatie offline. Sessies, langetermijngeheugen en werkruimtes staan op het "
            "datavolume, de service draait als een toegewijde niet-geprivilegieerde gebruiker in een verharde "
            "systemd-sandbox, en de mapkiezer hergebruikt de officiële bestandsbeheer-API van TOS, zodat "
            "machtigingen onder TOS-controle blijven."
        ),
        "release_note": (
            "Bevat Pi Agent Desktop, gebouwd uit de openbare broncode van deze repository, samen met een Node met "
            "vastgezette versie (exacte versies en SHA-256-controlesommen in PROVENANCE.md in de "
            "applicatiemap). Open de applicatie na installatie vanaf het TOS-bureaublad, stel je modelaanbieder "
            "(API-sleutel) in via het instellingenpaneel en kies een projectmap — de mapkiezer gebruikt de "
            "officiële bestandsbeheer-API van TOS. Let op: git is een afhankelijkheid van dit pakket (installeer "
            "het met je pakketbeheerder als het ontbreekt)."
        ),
        "important": (
            "Gegevens (sessies, langetermijngeheugen, werkruimtes) staan op het datavolume onder "
            "/Volume*/@apps/piagentfortos/data; 'apt remove' bewaart ze en 'apt purge' verwijdert ze. De "
            "webinterface heeft geen standaardwachtwoord, maar de service is alleen bereikbaar via de TOS-webroute "
            "/piagentfortos/ — er wordt geen externe poort geopend."
        ),
    },
    "sv-se": {
        "descript": (
            "Pi Agent Desktop är skrivbordsklienten för kodagenten pi; det här paketet kör den som en TOS-"
            "webbapplikation. Applikationen lyssnar endast på loopback och öppnas från TOS-skrivbordet i en ny "
            "webbläsarflik via plattformsrouten /piagentfortos/ — ingen extra port exponeras. Eftersom TOS saknar "
            "Node-runtime levereras en Node med låst version, sökverktygen ripgrep/fd och den inbyggda modulen "
            "för bildbehandling; allt fungerar offline direkt efter installationen. Sessioner, långtidsminne och "
            "arbetsytor ligger på datavolymen, tjänsten körs som en egen oprivilegierad användare i en härdad "
            "systemd-sandbox, och mappväljaren återanvänder TOS officiella API för filhantering så att "
            "behörigheterna förblir under TOS kontroll."
        ),
        "release_note": (
            "Innehåller Pi Agent Desktop byggt från det öppna källkoden i detta arkiv tillsammans med en Node med "
            "låst version (exakta versioner och SHA-256-summor i PROVENANCE.md i applikationsmappen). Efter "
            "installationen öppnar du applikationen från TOS-skrivbordet, ställer in din modellleverantör "
            "(API-nyckel) i inställningspanelen och väljer en projektmapp — mappväljaren bygger på TOS officiella "
            "API för filhantering. Obs: git är ett beroende för detta paket (installera det med din "
            "pakethanterare om det saknas)."
        ),
        "important": (
            "Data (sessioner, långtidsminne, arbetsytor) lagras på datavolymen under /Volume*/@apps/piagentfortos/data; "
            "'apt remove' behåller dem och 'apt purge' raderar dem. Webbgränssnittet har inget "
            "standardlösenord, men tjänsten nås endast via TOS webbroute /piagentfortos/ — ingen extern port "
            "öppnas."
        ),
    },
    "ja-jp": {
        "descript": (
            "Pi Agent Desktop はコーディングエージェント pi のデスクトップクライアントです。本パッケージは"
            "それを TOS のウェブアプリとして提供します。アプリはループバックのみを待ち受け、TOS デスクトップから"
            "プラットフォームのルート /piagentfortos/ 経由で新しいブラウザータブで開きます — 追加のポートは"
            "一切公開しません。TOS には Node ランタイムが無いため、本パッケージにはバージョンを固定した Node "
            "ランタイム、検索ツール ripgrep/fd、画像処理用ネイティブモジュールを同梱しており、インストール直後"
            "からオフラインで動作します。セッション・長期メモリ・ワークスペースはデータボリュームに保存され、"
            "サービスは専用の非特権ユーザーとして堅牢化した systemd サンドボックス内で動作し、フォルダー選択は"
            "TOS 公式のファイル管理 API を利用するため、権限は TOS の管理下に保たれます。"
        ),
        "release_note": (
            "本リポジトリの公開ソースからビルドした Pi Agent Desktop と、バージョンを固定した Node ランタイムを"
            "同梱しています（正確なバージョンと SHA-256 はアプリケーションディレクトリ内の PROVENANCE.md を"
            "参照）。インストール後、TOS デスクトップからアプリを開き、設定パネルでモデルプロバイダー"
            "（API キー）を設定し、プロジェクトフォルダーを選択すれば開始できます — フォルダー選択は TOS "
            "公式のファイル管理 API が提供します。注意：本パッケージは git に依存します（無い場合は"
            "パッケージマネージャーでインストールしてください）。"
        ),
        "important": (
            "データ（セッション・長期メモリ・ワークスペース）はデータボリュームの "
            "/Volume*/@apps/piagentfortos/data に保存されます。apt remove では保持され、apt purge で削除されます。"
            "ウェブ UI に既定のパスワードはありませんが、サービスは TOS のウェブルート /piagentfortos/ 経由でのみ"
            "アクセスでき、外部ポートは一切公開しません。"
        ),
    },
    "ko-kr": {
        "descript": (
            "Pi Agent Desktop는 코딩 에이전트 pi의 데스크톱 클라이언트이며, 이 패키지는 이를 TOS 웹 "
            "애플리케이션으로 제공합니다. 앱은 루프백에서만 수신 대기하며 TOS 데스크톱에서 플랫폼 경로 "
            "/piagentfortos/를 통해 새 브라우저 탭으로 열립니다 — 추가 포트는 전혀 노출하지 않습니다. TOS에는 "
            "Node 런타임이 없으므로 이 패키지는 버전이 고정된 Node 런타임과 검색 도구 ripgrep/fd, 이미지 처리용 "
            "네이티브 모듈을 함께 제공하여 설치 직후 오프라인으로 동작합니다. 세션, 장기 기억, 워크스페이스는 "
            "데이터 볼륨에 저장되고, 서비스는 전용 비특권 사용자로 강화된 systemd 샌드박스에서 실행되며, 폴더 "
            "선택기는 TOS 공식 파일 관리 API를 사용하므로 권한은 TOS가 계속 관리합니다."
        ),
        "release_note": (
            "이 저장소의 공개 소스로 빌드한 Pi Agent Desktop과 버전이 고정된 Node 런타임을 함께 "
            "제공합니다(정확한 버전과 SHA-256은 애플리케이션 디렉터리의 PROVENANCE.md 참고). 설치 후 TOS "
            "데스크톱에서 앱을 열고 설정 패널에서 모델 제공자(API 키)를 구성한 뒤 프로젝트 폴더를 선택하면 "
            "시작할 수 있습니다 — 폴더 선택기는 TOS 공식 파일 관리 API를 기반으로 합니다. 참고: git은 이 "
            "패키지의 의존성입니다(없으면 패키지 관리자로 설치하세요)."
        ),
        "important": (
            "데이터(세션, 장기 기억, 워크스페이스)는 데이터 볼륨의 /Volume*/@apps/piagentfortos/data에 "
            "저장됩니다. 'apt remove'는 보존하고 'apt purge'는 삭제합니다. 웹 UI에는 기본 비밀번호가 없지만 "
            "서비스는 TOS 웹 경로 /piagentfortos/로만 접근할 수 있으며 외부 포트를 열지 않습니다."
        ),
    },
    "ru-ru": {
        "descript": (
            "Pi Agent Desktop — настольный клиент coding-агента pi; этот пакет предоставляет его как веб-"
            "приложение TOS. Приложение слушает только loopback и открывается с рабочего стола TOS в новой "
            "вкладке браузера по маршруту /piagentfortos/ — дополнительные порты не публикуются. Поскольку в TOS "
            "нет среды Node, пакет включает Node с фиксированной версией, утилиты поиска ripgrep/fd и нативный "
            "модуль обработки изображений: всё работает офлайн сразу после установки. Сеансы, долговременная "
            "память и рабочие пространства размещаются на томе данных, служба работает под отдельным "
            "непривилегированным пользователем в усиленной песочнице systemd, а выбор папки использует "
            "официальный API управления файлами TOS, поэтому права остаются под контролем TOS."
        ),
        "release_note": (
            "Включает Pi Agent Desktop, собранный из открытых исходников этого репозитория, вместе с Node "
            "фиксированной версии (точные версии и суммы SHA-256 — в PROVENANCE.md в каталоге приложения). "
            "После установки откройте приложение с рабочего стола TOS, укажите провайдера модели (ключ API) в "
            "панели настроек и выберите папку проекта — выбор папки основан на официальном API управления "
            "файлами TOS. Примечание: git — зависимость этого пакета (установите его через менеджер пакетов, "
            "если он отсутствует)."
        ),
        "important": (
            "Данные (сеансы, долговременная память, рабочие пространства) хранятся на томе данных в "
            "/Volume*/@apps/piagentfortos/data; «apt remove» сохраняет их, «apt purge» удаляет. У веб-интерфейса "
            "нет пароля по умолчанию, но служба доступна только по веб-маршруту TOS /piagentfortos/ — внешние "
            "порты не открываются."
        ),
    },
    "pl-pl": {
        "descript": (
            "Pi Agent Desktop to klient pulpitu dla agenta kodującego pi; ten pakiet uruchamia go jako aplikację "
            "webową TOS. Aplikacja nasłuchuje wyłącznie na interfejsie loopback i otwiera się z pulpitu TOS w nowej "
            "karcie przeglądarki przez trasę /piagentfortos/ — żaden dodatkowy port nie jest wystawiany. Ponieważ "
            "TOS nie ma środowiska Node, pakiet zawiera Node w ustalonej wersji, narzędzia wyszukiwania "
            "ripgrep/fd oraz natywny moduł przetwarzania obrazu: wszystko działa offline zaraz po instalacji. "
            "Sesje, pamięć długoterminowa i obszary robocze są przechowywane na woluminie danych, usługa działa "
            "jako dedykowany użytkownik bez uprawnień w wzmocnionej piaskownicy systemd, a wybór folderów "
            "korzysta z oficjalnego API zarządzania plikami TOS, dzięki czemu uprawnienia pozostają pod kontrolą "
            "TOS."
        ),
        "release_note": (
            "Zawiera Pi Agent Desktop zbudowany z publicznych źródeł tego repozytorium wraz z Node w ustalonej "
            "wersji (dokładne wersje i sumy SHA-256 w PROVENANCE.md w katalogu aplikacji). Po instalacji otwórz "
            "aplikację z pulpitu TOS, skonfiguruj dostawcę modelu (klucz API) w panelu ustawień i wybierz folder "
            "projektu — wybór folderów opiera się na oficjalnym API zarządzania plikami TOS. Uwaga: git jest "
            "zależnością tego pakietu (zainstaluj go menedżerem pakietów, jeśli go brakuje)."
        ),
        "important": (
            "Dane (sesje, pamięć długoterminowa, obszary robocze) są przechowywane na woluminie danych w "
            "/Volume*/@apps/piagentfortos/data; „apt remove” je zachowuje, a „apt purge” usuwa. Interfejs webowy "
            "nie ma domyślnego hasła, ale usługa jest dostępna wyłącznie przez trasę webową TOS /piagentfortos/ — "
            "nie otwiera żadnego portu zewnętrznego."
        ),
    },
    "cs-cz": {
        "descript": (
            "Pi Agent Desktop je desktopový klient kódovacího agenta pi; tento balíček jej provozuje jako webovou "
            "aplikaci TOS. Aplikace naslouchá pouze na rozhraní loopback a otevírá se z plochy TOS v nové kartě "
            "prohlížeče přes trasu /piagentfortos/ — žádný další port se nevystavuje. Protože TOS nemá runtime "
            "Node, balíček přináší Node s pevně danou verzí, vyhledávací nástroje ripgrep/fd a nativní modul pro "
            "zpracování obrazu: vše funguje offline ihned po instalaci. Relace, dlouhodobá paměť a pracovní "
            "prostory jsou uloženy na datovém svazku, služba běží pod vyhrazeným neprivilegovaným uživatelem v "
            "utuženém sandboxu systemd a výběr složky využívá oficiální API TOS pro správu souborů, takže "
            "oprávnění zůstávají pod kontrolou TOS."
        ),
        "release_note": (
            "Obsahuje Pi Agent Desktop sestavený z veřejných zdrojů tohoto repozitáře společně s Node s pevně "
            "danou verzí (přesné verze a součty SHA-256 najdete v PROVENANCE.md v adresáři aplikace). Po instalaci "
            "otevřete aplikaci z plochy TOS, v panelu nastavení nakonfigurujte poskytovatele modelu (API klíč) a "
            "vyberte složku projektu — výběr složky využívá oficiální API TOS pro správu souborů. Poznámka: git je "
            "závislostí tohoto balíčku (pokud chybí, nainstalujte jej správcem balíčků)."
        ),
        "important": (
            "Data (relace, dlouhodobá paměť, pracovní prostory) jsou uložena na datovém svazku v "
            "/Volume*/@apps/piagentfortos/data; „apt remove“ je zachová a „apt purge“ je smaže. Webové rozhraní "
            "nemá výchozí heslo, služba je však dostupná pouze přes webovou trasu TOS /piagentfortos/ — neotevírá "
            "žádný externí port."
        ),
    },
    "hu-hu": {
        "descript": (
            "A Pi Agent Desktop a pi kódoló ügynök asztali kliense; ez a csomag TOS webalkalmazásként futtatja. "
            "Az alkalmazás kizárólag a loopback interfészen figyel, és a TOS asztalról nyílik meg új böngészőlapon "
            "a /piagentfortos/ útvonalon — további port nem kerül kiajánlásra. Mivel a TOS nem tartalmaz Node "
            "futtatókörnyezetet, a csomag rögzített verziójú Node-ot, a ripgrep/fd keresőeszközöket és a "
            "képfeldolgozó natív modult hozza magával, így telepítés után azonnal, offline is működik. A "
            "munkamenetek, a hosszú távú memória és a munkaterületek az adatköteten találhatók, a szolgáltatás "
            "külön, jogosultság nélküli felhasználóként fut egy megerősített systemd homokozóban, a mappaválasztó "
            "pedig a TOS hivatalos fájlkezelő API-ját használja, így a jogosultságok a TOS felügyelete alatt "
            "maradnak."
        ),
        "release_note": (
            "A csomag a repó nyilvános forrásából épített Pi Agent Desktopot és rögzített verziójú Node-ot "
            "tartalmaz (a pontos verziók és SHA-256 lenyomatok az alkalmazáskönyvtárban levő PROVENANCE.md-ben). "
            "Telepítés után nyissa meg az alkalmazást a TOS asztalról, a beállítások panelen adja meg a "
            "modellszolgáltatót (API-kulcs), majd válasszon projektmappát — a mappaválasztó a TOS hivatalos "
            "fájlkezelő API-ján alapul. Megjegyzés: a git a csomag függősége (ha hiányzik, telepítse a "
            "csomagkezelővel)."
        ),
        "important": (
            "Az adatok (munkamenetek, hosszú távú memória, munkaterületek) az adatköteten, a "
            "/Volume*/@apps/piagentfortos/data helyen tárolódnak; az „apt remove” megőrzi, az „apt purge” törli "
            "azokat. A webes felületnek nincs alapértelmezett jelszava, a szolgáltatás azonban csak a TOS "
            "/piagentfortos/ webes útvonalán érhető el — külső portot nem nyit."
        ),
    },
    "tr-tr": {
        "descript": (
            "Pi Agent Desktop, pi kodlama ajanının masaüstü istemcisidir; bu paket onu bir TOS web uygulaması "
            "olarak çalıştırır. Uygulama yalnızca loopback üzerinde dinler ve TOS masaüstünden /piagentfortos/ "
            "platform yolu üzerinden yeni bir tarayıcı sekmesinde açılır — ek bir port dışa açılmaz. TOS'ta Node "
            "çalışma zamanı bulunmadığından bu paket, sürümü sabitlenmiş bir Node çalışma zamanını, ripgrep/fd "
            "arama araçlarını ve görüntü işleme yerel modülünü birlikte getirir; kurulumdan sonra her şey çevrimdışı "
            "çalışır. Oturumlar, uzun süreli bellek ve çalışma alanları veri biriminde tutulur, hizmet sertleştirilmiş "
            "bir systemd korumalı alanında özel ayrıcalıksız bir kullanıcı olarak çalışır ve klasör seçici TOS'un "
            "resmî dosya yönetimi API'sini kullanır; böylece izinler TOS denetiminde kalır."
        ),
        "release_note": (
            "Bu deponun herkese açık kaynağından derlenen Pi Agent Desktop ile sürümü sabitlenmiş bir Node çalışma "
            "zamanını birlikte içerir (kesin sürümler ve SHA-256 özetleri uygulama dizinindeki PROVENANCE.md "
            "dosyasındadır). Kurulumdan sonra uygulamayı TOS masaüstünden açın, ayarlar panelinden model "
            "sağlayıcınızı (API anahtarı) yapılandırın ve bir proje klasörü seçin — klasör seçici TOS'un resmî "
            "dosya yönetimi API'sine dayanır. Not: git bu paketin bağımlılığıdır (yoksa paket yöneticinizle "
            "kurun)."
        ),
        "important": (
            "Veriler (oturumlar, uzun süreli bellek, çalışma alanları) veri biriminde "
            "/Volume*/@apps/piagentfortos/data altında saklanır; 'apt remove' bunları korur, 'apt purge' siler. Web "
            "arayüzünde varsayılan parola yoktur, ancak hizmete yalnızca TOS web yolu /piagentfortos/ üzerinden "
            "erişilebilir — hiçbir dış port açılmaz."
        ),
    },
    "ar-sa": {
        "descript": (
            "Pi Agent Desktop هو عميل سطح المكتب لوكيل البرمجة pi؛ وتقدّمه هذه الحزمة كتطبيق ويب على TOS. "
            "يستمع التطبيق على واجهة الاسترجاع المحلية (loopback) فقط، ويُفتح من سطح مكتب TOS في تبويب متصفح جديد عبر "
            "المسار /piagentfortos/ — دون كشف أي منفذ إضافي. ولمّا كان TOS لا يتضمن بيئة تشغيل Node، تضمّ هذه الحزمة "
            "بيئة Node بإصدار مثبّت، وأداتي البحث ripgrep/fd، ووحدة معالجة الصور الأصلية، فيعمل كل شيء دون اتصال "
            "بالإنترنت مباشرة بعد التثبيت. تُخزَّن الجلسات والذاكرة طويلة المدى ومساحات العمل على وحدة التخزين "
            "البيانية، وتعمل الخدمة بمستخدم مخصّص غير متميّز داخل حاوية systemd محصّنة، كما يستخدم محدّد المجلدات "
            "واجهة إدارة الملفات الرسمية في TOS، فتبقى الأذونات تحت إدارة TOS."
        ),
        "release_note": (
            "تتضمن الحزمة Pi Agent Desktop المبنيّ من الشفرة المصدرية العامة لهذا المستودع، مع بيئة Node بإصدار "
            "مثبّت (الإصدارات الدقيقة وبصمات SHA-256 في ملف PROVENANCE.md داخل مجلد التطبيق). بعد التثبيت، افتح "
            "التطبيق من سطح مكتب TOS، وأعدّ مزوّد النموذج (مفتاح API) في لوحة الإعدادات، ثم اختر مجلد المشروع — "
            "يعتمد محدّد المجلدات على واجهة إدارة الملفات الرسمية في TOS. ملاحظة: الحزمة تعتمد على git (ثبّته عبر "
            "مدير الحزم إن لم يكن موجودًا)."
        ),
        "important": (
            "تُحفظ البيانات (الجلسات، الذاكرة طويلة المدى، مساحات العمل) على وحدة التخزين البيانية في المسار "
            "/Volume*/@apps/piagentfortos/data؛ الأمر 'apt remove' يحتفظ بها بينما 'apt purge' يحذفها. لا توجد "
            "كلمة مرور افتراضية لواجهة الويب، لكن الخدمة لا يمكن الوصول إليها إلا عبر مسار الويب "
            "/piagentfortos/ — ولا يُفتح أي منفذ خارجي."
        ),
    },
    "he-il": {
        "descript": (
            "Pi Agent Desktop הוא לקוח שולחן העבודה של סוכן הקידוד pi; החבילה הזו מריצה אותו כאפליקציית ווב של "
            "TOS. האפליקציה מאזינה רק על ממשק ה-loopback ונפתחת משולחן העבודה של TOS בכרטיסייה חדשה בדפדפן דרך "
            "המסלול /piagentfortos/ — שום פורט נוסף אינו נחשף. מכיוון של-TOS אין סביבת הרצה של Node, החבילה "
            "כוללת סביבת Node בגרסה נעולה, את כלי החיפוש ripgrep/fd ואת המודול המקורי לעיבוד תמונות; הכול עובד "
            "לא מקוון מיד לאחר ההתקנה. ההפעלות, הזיכרון לטווח ארוך וסביבות העבודה נשמרים בכרך הנתונים, השירות רץ "
            "כמשתמש ייעודי חסר הרשאות בתוך ארגז חול systemd מוקשח, ובורר התיקיות עושה שימוש ב-API הרשמי של TOS "
            "לניהול קבצים, כך שההרשאות נשארות בשליטת TOS."
        ),
        "release_note": (
            "כולל את Pi Agent Desktop שנבנה מקוד המקור הציבורי של מאגר זה, יחד עם סביבת Node בגרסה נעולה (גרסאות "
            "מדויקות וסכומי SHA-256 בקובץ PROVENANCE.md בתיקיית האפליקציה). לאחר ההתקנה, פתחו את האפליקציה "
            "משולחן העבודה של TOS, הגדירו את ספק המודל (מפתח API) בלוח ההגדרות ובחרו תיקיית פרויקט — בורר "
            "התיקיות מבוסס על ה-API הרשמי של TOS לניהול קבצים. שימו לב: git הוא תלות של חבילה זו (התקינו אותו "
            "באמצעות מנהל החבילות אם הוא חסר)."
        ),
        "important": (
            "הנתונים (הפעלות, זיכרון לטווח ארוך, סביבות עבודה) נשמרים בכרך הנתונים תחת "
            "/Volume*/@apps/piagentfortos/data; הפקודה 'apt remove' משאירה אותם ואילו 'apt purge' מוחקת אותם. "
            "לממשק הווב אין סיסמה כברירת מחדל, אך השירות נגיש רק דרך מסלול הווב של TOS /piagentfortos/ — הוא "
            "אינו פותח פורט חיצוני."
        ),
    },
    "id-id": {
        "descript": (
            "Pi Agent Desktop adalah klien desktop untuk agen pengodean pi; paket ini menjalankannya sebagai "
            "aplikasi web TOS. Aplikasi hanya mendengarkan pada antarmuka loopback dan dibuka dari desktop TOS di "
            "tab peramban baru melalui rute /piagentfortos/ — tidak ada port tambahan yang diekspos. Karena TOS "
            "tidak memiliki runtime Node, paket ini menyertakan Node dengan versi terkunci, alat pencarian "
            "ripgrep/fd, dan modul native pemrosesan gambar; semuanya bekerja luring setelah pemasangan. Sesi, "
            "memori jangka panjang, dan ruang kerja disimpan pada volume data, layanan berjalan sebagai pengguna "
            "khusus tanpa hak istimewa di dalam sandbox systemd yang diperkeras, dan pemilih folder menggunakan "
            "API resmi pengelolaan berkas TOS sehingga izin tetap berada di bawah kendali TOS."
        ),
        "release_note": (
            "Menyertakan Pi Agent Desktop yang dibangun dari kode sumber publik repositori ini bersama Node "
            "dengan versi terkunci (versi tepat dan sidik jari SHA-256 ada di PROVENANCE.md pada direktori "
            "aplikasi). Setelah pemasangan, buka aplikasi dari desktop TOS, atur penyedia model (kunci API) di "
            "panel pengaturan, lalu pilih folder proyek — pemilih folder didukung API resmi pengelolaan berkas "
            "TOS. Catatan: git adalah dependensi paket ini (pasang melalui manajer paket bila belum ada)."
        ),
        "important": (
            "Data (sesi, memori jangka panjang, ruang kerja) disimpan pada volume data di "
            "/Volume*/@apps/piagentfortos/data; 'apt remove' menyimpannya dan 'apt purge' menghapusnya. Antarmuka "
            "web tidak memiliki kata sandi bawaan, tetapi layanan hanya dapat diakses melalui rute web TOS "
            "/piagentfortos/ — tidak membuka port eksternal apa pun."
        ),
    },
    "nb-no": {
        "descript": (
            "Pi Agent Desktop er skrivebordsklienten for kodeagenten pi; denne pakken kjører den som en TOS-"
            "webapplikasjon. Applikasjonen lytter kun på loopback og åpnes fra TOS-skrivebordet i en ny "
            "nettleserfane via plattformruten /piagentfortos/ — ingen ekstra port eksponeres. Siden TOS ikke har "
            "Node-runtime, leveres en Node med låst versjon, søkeverktøyene ripgrep/fd og den innebygde modulen "
            "for bildebehandling; alt fungerer frakoblet rett etter installasjon. Økter, langtidsminne og "
            "arbeidsområder ligger på datavolumet, tjenesten kjører som en egen uprivilegert bruker i en herdet "
            "systemd-sandkasse, og mappevelgeren gjenbruker TOS' offisielle API for filbehandling, slik at "
            "tillatelsene forblir under TOS' kontroll."
        ),
        "release_note": (
            "Inneholder Pi Agent Desktop bygget fra den åpne kildekoden i dette repositoriet sammen med en Node "
            "med låst versjon (eksakte versjoner og SHA-256-summer i PROVENANCE.md i applikasjonsmappen). Etter "
            "installasjon åpner du applikasjonen fra TOS-skrivebordet, konfigurerer modellleverandøren "
            "(API-nøkkel) i innstillingspanelet og velger en prosjektmappe — mappevelgeren bruker TOS' offisielle "
            "API for filbehandling. Merk: git er en avhengighet for denne pakken (installer det med "
            "pakkebehandleren hvis det mangler)."
        ),
        "important": (
            "Data (økter, langtidsminne, arbeidsområder) lagres på datavolumet under "
            "/Volume*/@apps/piagentfortos/data; 'apt remove' beholder dem og 'apt purge' sletter dem. "
            "Webgrensesnittet har ikke noe standardpassord, men tjenesten er bare tilgjengelig via TOS' web-rute "
            "/piagentfortos/ — den åpner ingen ekstern port."
        ),
    },
    "th-th": {
        "descript": (
            "Pi Agent Desktop เป็นไคลเอนต์เดสก์ท็อปสำหรับเอเจนต์เขียนโค้ด pi และแพ็กเกจนี้ให้บริการในรูปแบบเว็บ "
            "แอปของ TOS ตัวแอปฟังเฉพาะอินเทอร์เฟซ loopback และเปิดจากเดสก์ท็อป TOS ในแท็บใหม่ของเบราว์เซอร์ผ่านเส้นทาง "
            "/piagentfortos/ — ไม่เปิดพอร์ตเพิ่มเติมใด ๆ เนื่องจาก TOS ไม่มีรันไทม์ Node แพ็กเกจนี้จึงบรรจุรันไทม์ "
            "Node เวอร์ชันล็อกไว้ พร้อมเครื่องมือค้นหา ripgrep/fd และโมดูลประมวลผลภาพแบบเนทีฟ ทุกอย่างจึงทำงาน "
            "แบบออฟไลน์ได้ทันทีหลังติดตั้ง เซสชัน หน่วยความจำระยะยาว และเวิร์กสเปซเก็บอยู่บนดาต้าวอลุ่ม บริการ "
            "ทำงานในชื่อผู้ใช้เฉพาะที่ไม่ใช้สิทธิ์พิเศษภายในแซนด์บ็อกซ์ systemd ที่เสริมความปลอดภัย และตัวเลือก "
            "โฟลเดอร์ใช้ API จัดการไฟล์อย่างเป็นทางการของ TOS สิทธิ์การเข้าถึงจึงอยู่ภายใต้การจัดการของ TOS"
        ),
        "release_note": (
            "แพ็กเกจนี้มาพร้อม Pi Agent Desktop ที่บิลด์จากซอร์สสาธารณะของรีโพนี้ และรันไทม์ Node เวอร์ชันล็อก "
            "(ดูเวอร์ชันที่แน่นอนและค่า SHA-256 ได้ใน PROVENANCE.md ในไดเรกทอรีของแอป) หลังติดตั้ง ให้เปิดแอปจาก "
            "เดสก์ท็อป TOS ตั้งค่าผู้ให้บริการโมเดล (คีย์ API) ในแผงการตั้งค่า แล้วเลือกโฟลเดอร์โปรเจกต์ — "
            "ตัวเลือกโฟลเดอร์ทำงานบน API จัดการไฟล์อย่างเป็นทางการของ TOS หมายเหตุ: แพ็กเกจนี้ต้องใช้ git "
            "(หากยังไม่มีให้ติดตั้งผ่านตัวจัดการแพ็กเกจ)"
        ),
        "important": (
            "ข้อมูล (เซสชัน หน่วยความจำระยะยาว เวิร์กสเปซ) ถูกเก็บบนดาต้าวอลุ่มที่ "
            "/Volume*/@apps/piagentfortos/data โดย 'apt remove' จะเก็บไว้ และ 'apt purge' จะลบทั้งหมด "
            "เว็บ UI ไม่มีรหัสผ่านเริ่มต้น แต่เข้าถึงบริการได้เฉพาะผ่านเส้นทางเว็บของ TOS /piagentfortos/ — "
            "ไม่เปิดพอร์ตภายนอกใด ๆ"
        ),
    },
    "vi-vn": {
        "descript": (
            "Pi Agent Desktop là ứng dụng khách máy tính cho tác nhân lập trình pi; gói này cung cấp nó dưới "
            "dạng ứng dụng web của TOS. Ứng dụng chỉ lắng nghe trên giao diện loopback và được mở từ màn hình TOS "
            "trong một thẻ trình duyệt mới qua tuyến /piagentfortos/ — không mở thêm cổng nào ra bên ngoài. Vì TOS "
            "không có môi trường chạy Node, gói này đi kèm Node với phiên bản cố định, các công cụ tìm kiếm "
            "ripgrep/fd và mô-đun xử lý ảnh gốc, nên mọi thứ hoạt động ngoại tuyến ngay sau khi cài đặt. Phiên làm "
            "việc, bộ nhớ dài hạn và không gian làm việc được lưu trên phân vùng dữ liệu, dịch vụ chạy dưới một "
            "người dùng chuyên biệt không có đặc quyền trong sandbox systemd được gia cố, và trình chọn thư mục "
            "dùng API quản lý tệp chính thức của TOS nên quyền truy cập vẫn do TOS quản lý."
        ),
        "release_note": (
            "Bao gồm Pi Agent Desktop được xây dựng từ mã nguồn công khai của kho này cùng Node với phiên bản cố "
            "định (phiên bản chính xác và mã băm SHA-256 trong PROVENANCE.md ở thư mục ứng dụng). Sau khi cài "
            "đặt, hãy mở ứng dụng từ màn hình TOS, cấu hình nhà cung cấp mô hình (khóa API) trong bảng cài đặt và "
            "chọn một thư mục dự án — trình chọn thư mục dựa trên API quản lý tệp chính thức của TOS. Lưu ý: git "
            "là một phụ thuộc của gói này (hãy cài bằng trình quản lý gói nếu chưa có)."
        ),
        "important": (
            "Dữ liệu (phiên làm việc, bộ nhớ dài hạn, không gian làm việc) được lưu trên phân vùng dữ liệu tại "
            "/Volume*/@apps/piagentfortos/data; 'apt remove' sẽ giữ lại còn 'apt purge' sẽ xóa. Giao diện web "
            "không có mật khẩu mặc định, nhưng dịch vụ chỉ truy cập được qua tuyến web của TOS "
            "/piagentfortos/ — không mở bất kỳ cổng ngoài nào."
        ),
    },
}


def render() -> str:
    blocks = []
    for lang in LANGS:
        text = TEXTS.get(lang, EN)
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
