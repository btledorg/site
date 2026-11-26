import sys
from pathlib import Path

TARGET_FILE = sys.argv[1] if len(sys.argv) > 1 else "freedomwall.html"
path = Path(TARGET_FILE)
html = path.read_text(encoding="utf-8")

OLD_FN = """                        function isRunningInsideAppOrPWA() {
                            const ua = navigator.userAgent || "";
                            const isAndroidWebView = /; wv\)/i.test(ua) || (/Android/i.test(ua) && /Version\/\d+\.\d+/i.test(ua));
                            const isCustomWrapper = /ArcherFreedom|ARTcherApp/i.test(ua) || Boolean(window.AndroidInterface || window.ReactNativeWebView);
                            const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
                            return isAndroidWebView || isCustomWrapper || isStandalone;
                        }"""

NEW_FN = """                        function isRunningInsideAppOrPWA() {
                            const ua = navigator.userAgent || "";
                            const ref = document.referrer || "";
                            const params = new URLSearchParams(window.location.search);

                            const isAndroidWebView = /; wv\\)/i.test(ua) || (/Android/i.test(ua) && /Version\\/\\d+\\.\\d+/i.test(ua));
                            const isCustomWrapper = /ArcherFreedom|ARTcherApp|ArcherStudio/i.test(ua) || Boolean(window.AndroidInterface || window.ReactNativeWebView);
                            const isAndroidReferrer = ref.startsWith("android-app://") || ref.startsWith("file://");
                            const isEmbeddedIframe = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
                            const hasAppParam = params.get("app") === "1" || params.get("source") === "apk";
                            const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;

                            return isAndroidWebView || isCustomWrapper || isAndroidReferrer || isEmbeddedIframe || hasAppParam || isStandalone;
                        }"""

assert OLD_FN in html, "Could not find isRunningInsideAppOrPWA()"
html = html.replace(OLD_FN, NEW_FN, 1)
path.write_text(html, encoding="utf-8")
print("Updated isRunningInsideAppOrPWA() to detect iframes, android-app:// referrers, and ?app=1!")