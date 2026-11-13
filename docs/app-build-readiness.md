# Immigrant OS — App 构建就绪度核查

核查日期：**2026-11-13**（America/Los_Angeles）。本机实测时间见 A01。核查范围：M4-1 本机；M6-1、MBP 经 LAN SSH 各一次连接尝试。执行者：Codex，两个产出文件的唯一 writer；任务结束后 assignment 已清除。

**结论：本次没有任何一台机器被确认可以构建 iOS 或 Android。** M4-1 当前工具链未就绪；M6-1、MBP 因候选主机名无法解析，均为 **UNVERIFIED**，不能据此断言它们未安装工具或已离线。当前工作分支还缺少完整原生工程，补齐机器工具链也不足以直接在本工作区构建。

只读探针不等于编译成功；本次没有构建、签名、安装软件、下载大型 SDK/镜像、账号登录、付费、发布、云端 Wrangler 命令、提交、推送、合并或 audience/用户数据变更。

## 1. 仓库与旧文档核对

- 工作区：`/Users/chao/Projects/immigrant-os`；开始时 `git status --short` 无输出。分支 `app-build-readiness`，HEAD `2e0185bfb54029c125b7d3804eb125d280f7a137`，符合任务书基点（A08）。已先读根 `AGENTS.md` 和 `docs/project_state.md`；当前根目录没有 `PROGRAM.md`（A15），未推测其内容。
- **本分支**没有 `capacitor.config.ts`，`package.json` 没有 Capacitor 依赖或 `app:*` 脚本；Node 声明下限为 `>=22.13.0`（A08、A15）。`ios/`、`android/` 目录存在，里面有 Git 已跟踪的同步资源和 Cordova 占位文件，**不是完整平台工程，也不能称作被忽略的本地残留**。`ios/App/App.xcodeproj`、`android/app/build.gradle`、`android/gradlew`、wrapper 配置均缺失（A08）。
- 只读 `git show` / `git ls-tree` 检查本地 **`app-capacitor` 分支**，tip 为 `1396d5edb46d015a92ba9a6180d9a8883c937a64`：该分支具有配置、Xcode 工程、Android 工程和 Gradle wrapper（A09、A15）。配置采用 `mobile/www` 与远程 `server.url`；未访问该服务或改变配置（A11）。没有切换分支或复制原生文件。
- 该分支 manifest 与 lockfile 均记录 Capacitor core/CLI/iOS/Android **8.6.0**、assets **3.0.5**（A15）。这些是**本次命令读取的声明/锁定版本，不是本工作区实跑 CLI 的版本**；实际可执行 CLI 版本仍为 UNVERIFIED。
- 该分支工程声明 Android Gradle Plugin **8.13.0**、Gradle wrapper **8.14.3**、compile/target SDK **36**、min SDK **24**；iOS 使用 SPM，并精确引用 Capacitor **8.6.0**（A12）。它们是工程要求，不是已安装工具；Build Tools 与实际 JDK 的适配结果仍为 UNVERIFIED。
- 当前 `docs/` 中没有独立 mobile runbook；搜索 `capacitor|app-capacitor|xcode|android` 没有匹配（A09，本次新文档写入之前）。在 `app-capacitor:docs/mobile-app.md` 找到了旧 runbook；其开头仍写“依赖未安装/未写 lockfile、原生工程未生成”（A15）。这与同一 tip 的文件树和锁文件矛盾；该分支旧 `docs/project_state.md` 也保留了相同的未完成口径（本次执行 `git show app-capacitor:docs/project_state.md | rg -n -i -A 14 -B 3 "capacitor|mobile|xcode|android"` 核对）。**记录文档滞后，不修改旧文档。** 任务背景所述生成完成有文件树支持，但 `cap sync` 历史执行成功无法由文件存在单独证明，本次未重跑，标为 UNVERIFIED。

## 2. 各机器实测

“未找到”仅指本次命令的 PATH、环境变量、标准目录与开发目录选择范围；未做全盘搜索，其他用户或自定义路径安装均为 UNVERIFIED。附录编号对应实跑命令和原始关键输出。

### M4-1（实测 hostname：`Mac-mini-M4-1`）

| 工具 / 项目 | 实测版本或状态 | 证据命令 |
| --- | --- | --- |
| 系统 | macOS 26.6，build 25G72，arm64 | `sw_vers; uname -m`（A01） |
| Xcode | 不可用；选中 Command Line Tools；标准 `/Applications/Xcode.app` 未安装；Xcode 版本 UNVERIFIED | `xcodebuild -version`、`xcode-select -p`、`ls -ld /Applications/Xcode.app`（A02–A03） |
| Java | 当前环境找不到 Java Runtime；版本 UNVERIFIED | `java -version`、`/usr/libexec/java_home -V`（A04、A10） |
| Android SDK | 默认目录未安装；`ANDROID_HOME`、`ANDROID_SDK_ROOT` 为空；其他路径 UNVERIFIED | 环境变量输出、`ls -ld "$HOME/Library/Android/sdk"`（A05） |
| sdkmanager | PATH 中不存在；版本 UNVERIFIED | `command -v sdkmanager; sdkmanager --version`（A05） |
| Android Studio | 标准 `/Applications/Android Studio.app` 未安装；其他路径 UNVERIFIED | `ls -ld /Applications/Android\ Studio.app`（A10） |
| Node | v22.22.0 | `node -v`（A06） |
| npm | 11.14.1 | `npm -v`（A06） |
| Capacitor CLI | UNVERIFIED；本工作区无 `node_modules/.bin/cap`；离线调用返回 ENOTCACHED | 带禁止下载设置的 `npx cap --version`（A07–A08） |
| iOS 工程可读性 | UNVERIFIED / 未执行 list：缺完整 Xcode，且当前分支没有 `.xcodeproj` | A02、A08；未执行 `xcodebuild -list -project ios/App/App.xcodeproj` |
| Android 工程可读性 | UNVERIFIED / 未执行 tasks：默认 SDK、Java、当前分支 Gradle wrapper 和 app Gradle 文件均缺失 | A04–A05、A08；未执行 `./gradlew tasks --offline` |

`npx` 使用 offline + 禁止安装确认 + 临时缓存，避免自动下载同名 npm 包；错误中的 registry URL 是离线缓存查询目标，不代表已下载。没有因 CLI 缺失改用远程安装或历史版本冒充实测结果。

### M6-1

| 工具 / 项目 | 实测版本或状态 | 证据命令 |
| --- | --- | --- |
| LAN SSH | UNVERIFIED；仅尝试候选 `M6-1.local` 一次，主机名解析失败 | R01：`ssh ... M6-1.local 'sh -s'`，exit 255 |
| Xcode / developer path | UNVERIFIED；未进入远程 shell | R01 预定 `xcodebuild -version`、`xcode-select -p`、标准 Xcode 路径探针，未执行 |
| Java / Android SDK / sdkmanager | UNVERIFIED；未进入远程 shell | R01 预定 `java -version`、环境变量/默认目录、`sdkmanager --version`，未执行 |

### MBP

| 工具 / 项目 | 实测版本或状态 | 证据命令 |
| --- | --- | --- |
| LAN SSH | UNVERIFIED；仅尝试候选 `MBP.local` 一次，主机名解析失败 | R02：`ssh ... MBP.local 'sh -s'`，exit 255 |
| Xcode / developer path | UNVERIFIED；未进入远程 shell | R02 预定 `xcodebuild -version`、`xcode-select -p`、标准 Xcode 路径探针，未执行 |
| Java / Android SDK / sdkmanager | UNVERIFIED；未进入远程 shell | R02 预定 `java -version`、环境变量/默认目录、`sdkmanager --version`，未执行 |

本机 `~/.ssh/config` 只有另一台 NAS 的配置，没有这两台别名；`known_hosts` 可见主机别名及 `/etc/hosts` 中均无匹配 M6-1/MBP 的条目（A16；不推测散列条目内容）。已请求补充实际 LAN IP/SSH 主机名；本轮未获得确认地址，故以上 `.local` 名称只是基于任务标签的候选，**不是经过确认的舰队地址**。没有扫描 LAN、重试连接、修改 SSH 配置/known_hosts 或新建账号登录。

## 3. 缺口与下一步

以下均为后续工作建议，**本次没有执行安装或修复**。时间、下载量和磁盘预算是排期估算，非本次测速或实测包大小；实际以操作者选中的官方安装包和组件为准，安装前由操作者确认网络和空间。

| 缺口 | 谁处理、如何处理 | 估计耗时 / 资源 | 完成后的核查 |
| --- | --- | --- | --- |
| M6-1、MBP 的 LAN 地址与工具状态未知 | Chao 提供实际 IP/SSH 用户，或由能上机的助手在系统设置确认主机名、Remote Login 与已授权密钥；后续核查者对确认地址各跑一次附录远程 presence 探针。若需新增登录或修改访问权限，由 Chao 自行授权 | 每台约 5–15 分钟；无需下载 SDK | 保存真实 hostname、SSH 结果及版本输出；仍失败则保留 UNVERIFIED |
| M4-1 缺完整 Xcode / 当前只选中 CLT | Chao 或获授权的上机助手通过 Mac App Store 安装符合项目要求的 Xcode；Apple ID 会话、安装到 Applications 所需管理员授权、首次启动许可/组件由该 Mac 操作者处理。之后选择完整 Xcode 的 Developer 路径，例如 `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`；本次 Codex 不代办登录、许可或安装。[官方环境说明](https://capacitorjs.com/docs/getting-started/environment-setup) | 约 1–3 小时；下载按数 GB 至十余 GB 预算，组件另计，建议预留约 40–60 GB 工作空间；不是当前下载包尺寸声明 | `xcodebuild -version`、`xcode-select -p`；在完整 app checkout 执行只读 `xcodebuild -list -project ios/App/App.xcodeproj`，遇到需额外下载则先记录 |
| M4-1 缺 Android Studio / SDK | Chao 或获授权助手安装官方 Apple Silicon 版 Android Studio，运行 Setup Wizard；SDK Manager 中选择项目 compile SDK 36 对应平台、所需 Build Tools、Platform Tools 和命令行工具，先不选 emulator 系统镜像。实际 Build Tools 版本需按项目兼容性确认，当前 UNVERIFIED。[Google 安装说明](https://developer.android.com/studio/install)、[SDK Manager 说明](https://developer.android.com/tools/sdkmanager) | 约 30–90 分钟；IDE 加 SDK 下载按数 GB 至约 10 GB 预算，建议预留 20–30 GB 工作空间；网速慢时更久 | 确认 SDK 路径，设置 `ANDROID_HOME` 并将相应工具目录加入 PATH；复跑环境变量/目录探针和 `sdkmanager --version` |
| M4-1 缺可用 Java | 随 Android Studio 使用其 bundled JDK；操作者确认与锁定的 Gradle/Capacitor 工程兼容后，将 IDE Gradle JDK 与终端 `JAVA_HOME` 指向同一 JDK，并配置 PATH。无需仅因 `java` 提示就另买或盲装 Java。[Google JDK 说明](https://developer.android.com/build/jdks) | Studio 安装后约 5–15 分钟；bundled JDK 已包含在 IDE 下载中 | `java -version` 和实际 JDK 路径；兼容性未验证前不宣布 Android 就绪 |
| 当前工作分支不是完整 App 工程，CLI 不可用 | 后续由协调者/Codex 在另行授权的完整 `app-capacitor` checkout 中核对 manifest/lockfile 与原生文件，再按锁文件安装依赖并核查 CLI。不要在本次文档分支重跑 `cap add`、改依赖或合并分支 | checkout/检查约 10–20 分钟；依赖安装另约 5–20 分钟，取决于缓存/网络 | `npx cap --version`、配置、`.xcodeproj`、Gradle wrapper 均存在；声明版本与实跑版本分别登记 |
| 工程 list/tasks 尚未验证，Gradle/SPM 缓存状态未知 | 工具链与完整 checkout 就位后由核查助手执行 list 和 `./gradlew tasks --offline --no-daemon`。先确认 wrapper 分发包及依赖缓存可用；若缺缓存或需下载就停止并登记，另行安排下载窗口。不要把离线参数当作 wrapper 一定不会下载的保证 | 缓存齐全时约 5–15 分钟；缺缓存耗时与下载量 UNVERIFIED | 保存退出码及原文；探针成功仍只证明工程能加载，不证明编译、签名或发布成功 |
| App 旧文档与分支内容矛盾 | 后续另开文档任务，由协调者对 `app-capacitor:docs/mobile-app.md` 和该分支 `docs/project_state.md` 按实际执行证据更新，保留历史边界 | 约 10–20 分钟；无安装需求 | 生成状态、依赖状态、sync 与构建状态分别表述，不复用旧“未生成”结论 |

工具安装流程的官方页面已在本次核查中读取；页面描述只用于解释后续操作，**没有把页面上的软件版本当作本机实测版本**。Xcode/Studio/JDK 的最终安装版本须由安装后的命令输出登记。

## 4. 待 Chao 决定与验证边界

- 补充 M6-1、MBP 的正确 LAN 地址；结合复核结果决定使用哪台作为构建机，以及何时安排大体积安装。当前证据不足以推荐“某台已经可构建”。
- 本任务不需要购买或加入任何开发者计划；签名账号、付费、商店上传、测试者邀请和公开访问均未核查或操作，后续若涉及仍由 Chao 单独决定。旧 runbook 的账号/会员信息未重新验证，不据此作承诺。
- 遵循本次“只核查、不安装、不构建”的更具体限制，未运行 `npm ci`、`npm test` 或 `npx tsc --noEmit`：前者安装依赖，`npm test` 在当前 package scripts 中会调用构建，且本次没有 TypeScript/产品代码变更。不能把历史测试结果算作本次通过。
- 本次验收使用证据核对、`git diff --check`、工作区改动白名单与文件字节数检查。只交付本文件和 `docs/project_state.md` 末尾一行，未修改旧文档、平台目录、依赖、源码或测试。

## 附录：本次实跑命令与关键原始输出

命令均在仓库根目录执行；`stdout`、`stderr` 分开保存。组合命令的退出码是最后一条命令的状态，不能代替逐项输出判断；无输出不代表安装成功。以下保留相关原始输出（仅去掉空白行的行尾空格），不包含账号凭据、完整 agent transcript 或 npm debug log。临时采集文件仅位于 `/private/tmp`。

### A01

```sh
date -Iseconds; hostname; sw_vers; uname -m
```

退出码：`0`。

stdout：

```text
2026-11-13T11:41:13-08:00
Mac-mini-M4-1
ProductName:		macOS
ProductVersion:		26.6
BuildVersion:		25G72
arm64
```

stderr：

```text
(empty)
```

### A02

```sh
xcodebuild -version
```

退出码：`1`。

stdout：

```text
(empty)
```

stderr：

```text
xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance
```

### A03

```sh
xcode-select -p; ls -ld /Applications/Xcode.app /Library/Developer/CommandLineTools
```

退出码：`1`。

stdout：

```text
/Library/Developer/CommandLineTools
drwxr-xr-x  5 root  wheel  160 Feb 25  2026 /Library/Developer/CommandLineTools
```

stderr：

```text
ls: /Applications/Xcode.app: No such file or directory
```

### A04

```sh
java -version
```

退出码：`1`。

stdout：

```text
(empty)
```

stderr：

```text
The operation couldn’t be completed. Unable to locate a Java Runtime.
Please visit http://www.java.com for information on installing Java.

```

### A05

```sh
printf "ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\nJAVA_HOME=%s\n" "$ANDROID_HOME" "$ANDROID_SDK_ROOT" "$JAVA_HOME"; ls -ld "$HOME/Library/Android/sdk"; command -v sdkmanager; sdkmanager --version
```

退出码：`127`。

stdout：

```text
ANDROID_HOME=
ANDROID_SDK_ROOT=
JAVA_HOME=
```

stderr：

```text
ls: /Users/chao/Library/Android/sdk: No such file or directory
zsh:1: command not found: sdkmanager
```

### A06

```sh
node -v; npm -v
```

退出码：`0`。

stdout：

```text
v22.22.0
11.14.1
```

stderr：

```text
(empty)
```

### A07

```sh
npm_config_offline=true npm_config_yes=false npm_config_update_notifier=false npm_config_cache=/private/tmp/immigrant-app-readiness-npm-cache npx cap --version
```

退出码：`1`。

stdout：

```text
(empty)
```

stderr：

```text
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/cap failed: cache mode is 'only-if-cached' but no cached response is available.
npm error A complete log of this run can be found in: /private/tmp/immigrant-app-readiness-npm-cache/_logs/2026-11-13T19_41_13_899Z-debug-0.log
```

### A08

```sh
git branch --show-current; git rev-parse HEAD; git ls-files capacitor.config.ts package.json ios android; git check-ignore ios ios/App/App/capacitor.config.json android android/app/src/main/assets/capacitor.config.json; ls -ld capacitor.config.ts ios ios/App/App.xcodeproj ios/App/App.xcodeproj/project.pbxproj android android/app/build.gradle android/gradlew android/gradle/wrapper/gradle-wrapper.properties node_modules/.bin/cap
```

退出码：`1`。

stdout：

```text
app-build-readiness
2e0185bfb54029c125b7d3804eb125d280f7a137
android/app/build/.npmkeep
android/app/src/main/assets/capacitor.config.json
android/app/src/main/assets/capacitor.plugins.json
android/app/src/main/assets/public/cordova.js
android/app/src/main/assets/public/cordova_plugins.js
android/app/src/main/assets/public/index.html
android/app/src/main/res/xml/config.xml
android/capacitor-cordova-android-plugins/build.gradle
android/capacitor-cordova-android-plugins/cordova.variables.gradle
android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml
android/capacitor-cordova-android-plugins/src/main/java/.gitkeep
android/capacitor-cordova-android-plugins/src/main/res/.gitkeep
ios/App/App/capacitor.config.json
ios/App/App/config.xml
ios/App/App/public/cordova.js
ios/App/App/public/cordova_plugins.js
ios/App/App/public/index.html
ios/capacitor-cordova-ios-plugins/CordovaPluginsResources.podspec
ios/capacitor-cordova-ios-plugins/resources/.gitkeep
ios/capacitor-cordova-ios-plugins/sources/.gitkeep
package.json
drwxr-xr-x  4 chao  staff  128 Nov  9 22:57 android
drwxr-xr-x  4 chao  staff  128 Nov  9 22:57 ios
```

stderr：

```text
ls: android/app/build.gradle: No such file or directory
ls: android/gradle/wrapper/gradle-wrapper.properties: No such file or directory
ls: android/gradlew: No such file or directory
ls: capacitor.config.ts: No such file or directory
ls: ios/App/App.xcodeproj: No such file or directory
ls: ios/App/App.xcodeproj/project.pbxproj: No such file or directory
ls: node_modules/.bin/cap: No such file or directory
```

### A09

原始 stdout 节选：目录清单与 `app-capacitor` 关键工程路径；省略同次 `ls-tree` 的图片/资源路径。搜索命令未返回匹配行。

```sh
rg --files docs; rg -n -i "capacitor|app-capacitor|xcode|android" docs README.md; git branch --list app-capacitor; git ls-tree -r --name-only app-capacitor -- capacitor.config.ts package.json docs ios android
```

退出码：`0`。

stdout：

```text
docs/agent-mcp.md
docs/project_state.md
docs/reminders-v1-design.md
docs/uscis-status-v1-design.md
docs/ai-assistant-v1-design.md
docs/operations.md
docs/agent-prompt.md
docs/cloudflare-hosting.md
docs/content-audit.md
  app-capacitor
android/app/build.gradle
android/gradle/wrapper/gradle-wrapper.properties
android/gradlew
capacitor.config.ts
docs/mobile-app.md
ios/App/App.xcodeproj/project.pbxproj
```

stderr：

```text
(empty)
```

### A10

```sh
ls -ld /Applications/Android\ Studio.app; /usr/libexec/java_home -V; ls -ld /Library/Java/JavaVirtualMachines "$HOME/Library/Java/JavaVirtualMachines"; rg --files ios android
```

退出码：`0`。

stdout：

```text
drwxr-xr-x  2 root  wheel  64 Jul 22 14:57 /Library/Java/JavaVirtualMachines
ios/capacitor-cordova-ios-plugins/CordovaPluginsResources.podspec
android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml
ios/App/App/capacitor.config.json
android/capacitor-cordova-android-plugins/cordova.variables.gradle
android/capacitor-cordova-android-plugins/build.gradle
ios/App/App/public/cordova_plugins.js
ios/App/App/public/cordova.js
ios/App/App/public/index.html
ios/App/App/config.xml
android/app/src/main/assets/capacitor.config.json
android/app/src/main/assets/capacitor.plugins.json
android/app/src/main/assets/public/cordova_plugins.js
android/app/src/main/assets/public/cordova.js
android/app/src/main/assets/public/index.html
android/app/src/main/res/xml/config.xml
```

stderr：

```text
ls: /Applications/Android Studio.app: No such file or directory
The operation couldn’t be completed. Unable to locate a Java Runtime.
Please visit http://www.java.com for information on installing Java.

ls: /Users/chao/Library/Java/JavaVirtualMachines: No such file or directory
```

### A11

原始 stdout 节选：只保留 tip 和配置文件段；旧文档开头及依赖版本另见 A15。

```sh
git rev-parse app-capacitor; git show app-capacitor:docs/mobile-app.md; git show app-capacitor:capacitor.config.ts; git show app-capacitor:package.json
```

退出码：`0`。

stdout：

```text
1396d5edb46d015a92ba9a6180d9a8883c937a64
// Remote-site shell: never point webDir at a static export of the live app.
// The owner must confirm this placeholder identifier before store registration.
// No CLI type import until app:install-tooling can resolve the official packages.
const config = {
  appId: 'com.neoloong.immigrantos',
  appName: 'Immigrant OS',
  webDir: 'mobile/www',
  server: {
    url: 'https://immigrant-os.neoloong.workers.dev',
    cleartext: false,
  },
  backgroundColor: '#f8f9f6',
};

export default config;
```

stderr：

```text
(empty)
```

### A12

```sh
git show app-capacitor:android/build.gradle; git show app-capacitor:android/variables.gradle; git show app-capacitor:android/gradle/wrapper/gradle-wrapper.properties; git show app-capacitor:ios/App/CapApp-SPM/Package.swift; git show app-capacitor:android/app/build.gradle
```

退出码：`0`。

stdout：

```text
// Top-level build file where you can add configuration options common to all sub-projects/modules.

buildscript {

    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.13.0'
        classpath 'com.google.gms:google-services:4.4.4'

        // NOTE: Do not place your application dependencies here; they belong
        // in the individual module build.gradle files
    }
}

apply from: "variables.gradle"

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}
ext {
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
    androidxActivityVersion = '1.11.0'
    androidxAppCompatVersion = '1.7.1'
    androidxCoordinatorLayoutVersion = '1.3.0'
    androidxCoreVersion = '1.17.0'
    androidxFragmentVersion = '1.8.9'
    coreSplashScreenVersion = '1.2.0'
    androidxWebkitVersion = '1.14.0'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.3.0'
    androidxEspressoCoreVersion = '3.7.0'
    cordovaAndroidVersion = '14.0.1'
}distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.14.3-all.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.0")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ]
        )
    ]
)
apply plugin: 'com.android.application'

android {
    namespace = "com.neoloong.immigrantos"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.neoloong.immigrantos"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
             // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
             // Default: https://android.googlesource.com/platform/frameworks/base/+/282e181b58cf72b6ca770dc7ca5f91f135444502/tools/aapt/AaptAssets.cpp#61
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

repositories {
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
    implementation project(':capacitor-cordova-android-plugins')
}

apply from: 'capacitor.build.gradle'

try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
```

stderr：

```text
(empty)
```

### A15

```sh
python3 - <<'INNER'
import subprocess,json
from pathlib import Path
for ref in ['CURRENT','app-capacitor']:
 p=json.loads(Path('package.json').read_text() if ref=='CURRENT' else subprocess.check_output(['git','show',ref+':package.json'],text=True))
 print(ref+' node engine: '+p['engines']['node'])
 print(ref+' Capacitor deps: '+json.dumps({k:v for s in ['dependencies','devDependencies'] for k,v in p.get(s,{}).items() if k.startswith('@capacitor/')}))
 print(ref+' app scripts: '+json.dumps({k:v for k,v in p['scripts'].items() if k.startswith('app:')}))
p=json.loads(subprocess.check_output(['git','show','app-capacitor:package-lock.json'],text=True))
for k in ['core','cli','ios','android','assets']:
 print('app-capacitor lockfile @capacitor/'+k+': '+p['packages']['node_modules/@capacitor/'+k]['version'])
print('app-capacitor ref: '+subprocess.check_output(['git','rev-parse','app-capacitor'],text=True).strip())
print('Historical docs/mobile-app.md first 22 lines:')
print('\n'.join(subprocess.check_output(['git','show','app-capacitor:docs/mobile-app.md'],text=True).splitlines()[:22]))
print('CURRENT PROGRAM.md exists:',Path('PROGRAM.md').exists())
INNER
```

退出码：`0`。

stdout：

```text
CURRENT node engine: >=22.13.0
CURRENT Capacitor deps: {}
CURRENT app scripts: {}
app-capacitor node engine: >=22.13.0
app-capacitor Capacitor deps: {"@capacitor/android": "8.6.0", "@capacitor/assets": "3.0.5", "@capacitor/cli": "8.6.0", "@capacitor/core": "8.6.0", "@capacitor/ios": "8.6.0"}
app-capacitor app scripts: {"app:install-tooling": "npm install --save-dev --save-exact @capacitor/core@8 @capacitor/cli@8 @capacitor/ios@8 @capacitor/android@8 @capacitor/assets@3", "app:sync": "cap sync", "app:ios": "cap open ios", "app:android": "cap open android", "app:assets": "node scripts/mobile-assets.mjs"}
app-capacitor lockfile @capacitor/core: 8.6.0
app-capacitor lockfile @capacitor/cli: 8.6.0
app-capacitor lockfile @capacitor/ios: 8.6.0
app-capacitor lockfile @capacitor/android: 8.6.0
app-capacitor lockfile @capacitor/assets: 3.0.5
app-capacitor ref: 1396d5edb46d015a92ba9a6180d9a8883c937a64
Historical docs/mobile-app.md first 22 lines:
# Immigrant OS mobile shell

## Delivery status — 2026-11-09

This is a **partial scaffold, not a buildable native release**. Branch `app-capacitor`
starts at `independent-hosting` commit `6a7a629` in the isolated local clone
`work/app-capacitor`. The original checkout's `.git` is read-only in the agent
sandbox, so the original checkout stays on `independent-hosting`.

- Configuration, npm entry points, asset generation wiring, and this runbook exist.
- Capacitor packages are **not installed or added to the lockfile**. Registry access
  fails with `ENOTFOUND registry.npmjs.org`; offline install fails with `ENOTCACHED`.
  `app:install-tooling` completes this step when network access is available and
  saves exact versions as dev dependencies. The existing web lockfile remains valid.
- Neither `ios/` nor `android/` has been generated. Attempts to run the official
  CLI for both platforms stopped at package resolution (`ENOTCACHED`), before
  native generation. No native build, sync, signing, or asset output is verified.
- Only Apple Command Line Tools are selected (`/Library/Developer/CommandLineTools`).
  Full Xcode is absent; `xcodebuild -version` fails. Android Studio and the default
  Android SDK directory are absent; `/usr/libexec/java_home -V` finds no Java runtime.

## Validation in this environment
CURRENT PROGRAM.md exists: False
```

stderr：

```text
(empty)
```

### R01

```sh
ssh -o BatchMode=yes -o ConnectTimeout=8 -o ConnectionAttempts=1 -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ControlMaster=no -o ControlPath=none -o ClearAllForwardings=yes M6-1.local 'sh -s'
```

预定发送的 stdin（连接失败，远程未执行）：

```sh
hostname
xcodebuild -version
xcode-select -p
ls -ld /Applications/Xcode.app
java -version
printf 'ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\nJAVA_HOME=%s\n' "$ANDROID_HOME" "$ANDROID_SDK_ROOT" "$JAVA_HOME"
ls -ld "$HOME/Library/Android/sdk"
if [ -n "$ANDROID_HOME" ]; then ls -ld "$ANDROID_HOME"; fi
if [ -n "$ANDROID_SDK_ROOT" ]; then ls -ld "$ANDROID_SDK_ROOT"; fi
command -v sdkmanager
sdkmanager --version
```

退出码：`255`。

stdout：

```text
(empty)
```

stderr：

```text
ssh: Could not resolve hostname m6-1.local: nodename nor servname provided, or not known
```

### R02

```sh
ssh -o BatchMode=yes -o ConnectTimeout=8 -o ConnectionAttempts=1 -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ControlMaster=no -o ControlPath=none -o ClearAllForwardings=yes MBP.local 'sh -s'
```

预定发送的 stdin（连接失败，远程未执行）：

```sh
hostname
xcodebuild -version
xcode-select -p
ls -ld /Applications/Xcode.app
java -version
printf 'ANDROID_HOME=%s\nANDROID_SDK_ROOT=%s\nJAVA_HOME=%s\n' "$ANDROID_HOME" "$ANDROID_SDK_ROOT" "$JAVA_HOME"
ls -ld "$HOME/Library/Android/sdk"
if [ -n "$ANDROID_HOME" ]; then ls -ld "$ANDROID_HOME"; fi
if [ -n "$ANDROID_SDK_ROOT" ]; then ls -ld "$ANDROID_SDK_ROOT"; fi
command -v sdkmanager
sdkmanager --version
```

退出码：`255`。

stdout：

```text
(empty)
```

stderr：

```text
ssh: Could not resolve hostname mbp.local: nodename nor servname provided, or not known
```

### A16

```sh
python3 - <<'INNER'
from pathlib import Path
p=Path.home()/'.ssh/config'
print('SSH config exists:',p.exists())
if p.exists():
 for line in p.read_text().splitlines():
  fields=line.strip().split()
  if fields and fields[0].lower() in ['host','include']:print(line)
for label,p in [('Known host aliases',Path.home()/'.ssh/known_hosts'),('Hosts entries',Path('/etc/hosts'))]:
 print(label+' matching requested fleet:')
 if p.exists():
  for line in p.read_text().splitlines():
   parts=line.split()
   value=parts[0] if label=='Known host aliases' and parts else line
   if any(n in value.lower() for n in ['m6-1','mbp']):print(value)
INNER
```

退出码：`0`。

stdout：

```text
SSH config exists: True
Host nas
Known host aliases matching requested fleet:
Hosts entries matching requested fleet:
```

stderr：

```text
(empty)
```

## 补充核查（Muse，2026-11-13，Codex 交稿后）

Codex 正文（§2 M6-1/MBP 两节与结论句）保留原样；以下为验收方用舰队已知 LAN 地址直连补查的结果，结论以此补充为准。

- **M6-1（192.168.1.153，`Mac-mini-M6-1`）**：与 M4-1 相同缺口——`xcodebuild` 报 CLT-only 错误、`/Applications/Xcode.app` 不存在、无 Java Runtime、`~/Library/Android/sdk` 不存在、无 `sdkmanager`。
- **MBP（192.168.1.70，`Chaos-MacBook-Pro.local`）**：**Xcode 26.3（Build 17C529）已安装**，developer 目录为 `/Applications/Xcode.app/Contents/Developer`；无 Java Runtime、无 `~/Library/Android/sdk`、无 `sdkmanager`。
- **更新结论**：iOS 工具链目前只在 MBP 上存在；Android 工具链三台机器均无；M4-1 与 M6-1 均缺 Xcode。Xcode 存在 ≠ 可构建——仍需在完整 `app-capacitor` checkout 上安装依赖并跑 `cap sync` / `xcodebuild -list` 验证，另行安排。下一步首选：在 MBP 上做 iOS 构建验证；Android 需先在任一机器上装 Android Studio + SDK（Chao 或获授权的上机助手操作）。

