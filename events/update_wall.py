
from pathlib import Path
import re
import shutil
import sys

HTML_FILE = Path("freedomwall.html")
BACKUP_FILE = Path("freedomwall.backup.html")

CSS = r"""
/* Freedom Wall Text Layer Manager */
#fw-layer-panel {
    position: fixed;
    right: 18px;
    top: 100px;
    width: 260px;
    max-height: 65vh;
    overflow-y: auto;
    z-index: 99999;
    background: #17191f;
    color: #f5f5f5;
    border: 1px solid #343945;
    border-radius: 12px;
    padding: 14px;
    box-shadow: 0 8px 30px #0007;
    font: 13px Arial, sans-serif;
}

#fw-layer-panel * {
    box-sizing: border-box;
}

#fw-layer-panel .fw-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-weight: bold;
    font-size: 15px;
}

#fw-layer-panel .fw-layer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px;
    margin: 5px 0;
    background: #242832;
    border: 1px solid #353b49;
    border-radius: 7px;
    cursor: grab;
}

#fw-layer-panel .fw-layer.active {
    border-color: #3b82f6;
    background: #253653;
}

#fw-layer-panel .fw-layer.dragging {
    opacity: .4;
}

#fw-layer-panel .fw-layer-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

#fw-layer-panel button {
    border: 0;
    border-radius: 5px;
    padding: 5px 8px;
    color: white;
    background: #343b49;
    cursor: pointer;
}

#fw-layer-panel button:hover {
    background: #475569;
}

#fw-layer-panel .fw-delete {
    background: #9f3030;
}

#fw-layer-panel .fw-delete:hover {
    background: #c43d3d;
}

#fw-layer-panel .fw-empty {
    color: #9299a8;
    padding: 12px 4px;
    text-align: center;
}

@media (max-width: 700px) {
    #fw-layer-panel {
        top: auto;
        bottom: 85px;
        right: 10px;
        width: min(230px, calc(100vw - 20px));
        max-height: 35vh;
    }
}
"""

JS = r"""
(() => {
    if (window.__freedomWallLayersInstalled) return;
    window.__freedomWallLayersInstalled = true;

    const panel = document.createElement("aside");
    panel.id = "fw-layer-panel";
    panel.innerHTML = `
        <div class="fw-heading">
            <span>Text Layers</span>
            <span id="fw-layer-count">0</span>
        </div>
        <div id="fw-layer-list">
            <div class="fw-empty">No text layers yet</div>
        </div>
    `;
    document.body.appendChild(panel);

    const list = panel.querySelector("#fw-layer-list");
    const count = panel.querySelector("#fw-layer-count");

    let selected = null;
    let dragged = null;
    let refreshQueued = false;

    function textElements() {
        return [...document.querySelectorAll(".text-box")];
    }

    function getText(element) {
        const editable = element.querySelector(
            '[contenteditable="true"], textarea, input'
        );
        return (editable || element).innerText?.trim() ||
               editable?.value?.trim() || "Untitled text";
    }

    function selectLayer(element) {
        selected = element;

        textElements().forEach(el => {
            el.classList.toggle("fw-layer-selected", el === element);
        });

        if (typeof window.selectText === "function") {
            try { window.selectText(element); } catch (_) {}
        }

        refresh();
    }

    function deleteLayer(element) {
        if (!element || !element.isConnected) return;

        const deleteButton = element.querySelector(
            'button[title*="Delete"], button[aria-label*="Delete"], .delete-text'
        );

        if (deleteButton) {
            deleteButton.click();
        } else {
            element.remove();
        }

        if (selected === element) selected = null;
        refresh();
    }

    function renameLayer(element) {
        const current = getText(element);
        const name = prompt("Rename this layer:", current);

        if (name === null) return;

        element.dataset.fwLayerName = name.trim() || "Untitled layer";
        refresh();
    }

    function reorderLayers() {
        const elements = [...list.querySelectorAll(".fw-layer")];

        elements.forEach((row, index) => {
            const element = row._fwElement;
            if (!element || !element.isConnected) return;

            element.style.zIndex = String(100 + index);
            element.dataset.fwLayerOrder = String(index);
        });
    }

    function refresh() {
        if (refreshQueued) return;
        refreshQueued = true;

        requestAnimationFrame(() => {
            refreshQueued = false;

            const elements = textElements();
            count.textContent = elements.length;
            list.innerHTML = "";

            if (!elements.length) {
                list.innerHTML =
                    '<div class="fw-empty">No text layers yet</div>';
                selected = null;
                return;
            }

            elements.forEach((element, index) => {
                const row = document.createElement("div");
                row.className = "fw-layer";
                row.draggable = true;
                row._fwElement = element;

                if (element === selected) row.classList.add("active");

                const name = document.createElement("span");
                name.className = "fw-layer-name";
                name.textContent =
                    element.dataset.fwLayerName || getText(element) ||
                    `Text ${index + 1}`;
                name.title = "Click to select; double-click to rename";

                name.addEventListener("click", () => selectLayer(element));
                name.addEventListener("dblclick", () => renameLayer(element));

                const edit = document.createElement("button");
                edit.textContent = "Edit";
                edit.title = "Edit layer text";
                edit.addEventListener("click", () => {
                    selectLayer(element);
                    const editable = element.querySelector(
                        '[contenteditable="true"], textarea, input'
                    );

                    if (editable) {
                        editable.focus();
                        if (editable.isContentEditable) {
                            const range = document.createRange();
                            range.selectNodeContents(editable);
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }
                });

                const remove = document.createElement("button");
                remove.textContent = "×";
                remove.className = "fw-delete";
                remove.title = "Delete this layer";
                remove.addEventListener("click", () => deleteLayer(element));

                row.append(name, edit, remove);

                row.addEventListener("dragstart", () => {
                    dragged = row;
                    row.classList.add("dragging");
                });

                row.addEventListener("dragend", () => {
                    row.classList.remove("dragging");
                    dragged = null;
                    reorderLayers();
                });

                row.addEventListener("dragover", event => {
                    event.preventDefault();
                    if (!dragged || dragged === row) return;

                    const rect = row.getBoundingClientRect();
                    const after = event.clientY > rect.top + rect.height / 2;

                    list.insertBefore(
                        dragged,
                        after ? row.nextSibling : row
                    );
                });

                row.addEventListener("drop", event => {
                    event.preventDefault();
                    reorderLayers();
                });

                list.appendChild(row);
            });
        });
    }

    // Switch to Hand Tool after adding a text element.
    function switchToHand() {
        if (typeof window.setTool === "function") {
            window.setTool("hand");
            return;
        }

        const handButton = [...document.querySelectorAll(
            "button, [role='button']"
        )].find(button => {
            const label = (
                (button.textContent || "") + " " +
                (button.title || "") + " " +
                (button.getAttribute("aria-label") || "")
            ).toLowerCase();

            return label.includes("hand tool") ||
                   label.trim() === "hand";
        });

        if (handButton) handButton.click();
        document.body.classList.add("mode-hand");
    }

    // Detect newly created text elements.
    const observer = new MutationObserver(() => {
        const elements = textElements();

        elements.forEach(element => {
            if (element.dataset.fwLayerTracked) return;

            element.dataset.fwLayerTracked = "true";

            element.addEventListener("pointerdown", () => {
                selectLayer(element);
            });

            element.addEventListener("focusin", () => {
                selectLayer(element);
            });

            switchToHand();
        });

        refresh();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Keep the layer list synchronized with text edits.
    document.addEventListener("input", event => {
        if (event.target.closest(".text-box")) refresh();
    });

    document.addEventListener("click", event => {
        if (event.target.closest(".text-box")) {
            const element = event.target.closest(".text-box");
            if (element) selectLayer(element);
        }
    });

    // Initial scan.
    textElements().forEach(element => {
        element.dataset.fwLayerTracked = "true";
    });

    refresh();

    console.info("Freedom Wall Text Layers installed.");
})();
"""


def main():
    if not HTML_FILE.exists():
        print("ERROR: freedomwall.html was not found.")
        print("Place update_wall.py beside freedomwall.html.")
        sys.exit(1)

    original = HTML_FILE.read_text(encoding="utf-8")

    if "__freedomWallLayersInstalled" in original:
        print("Text Layer Manager is already installed.")
        sys.exit(0)

    if "</body>" not in original.lower():
        print("ERROR: Could not find the closing </body> tag.")
        print("No changes were made.")
        sys.exit(1)

    shutil.copy2(HTML_FILE, BACKUP_FILE)
    print(f"Backup created: {BACKUP_FILE}")

    injection = f"""
<style>
{CSS}
</style>
<script>
{JS}
</script>
"""

    updated, replacements = re.subn(
        r"</body\s*>",
        lambda match: injection + match.group(0),
        original,
        count=1,
        flags=re.IGNORECASE
    )

    if replacements != 1:
        print("ERROR: Could not safely inject the update.")
        print("Your original file remains backed up.")
        sys.exit(1)

    HTML_FILE.write_text(updated, encoding="utf-8")

    print("SUCCESS: Freedom Wall updated.")
    print("Added:")
    print("- Text Layer Manager")
    print("- Individual layer selection and deletion")
    print("- Layer renaming")
    print("- Drag-to-reorder layer list")
    print("- Text editing from the layer panel")
    print("- Automatic Hand Tool switching attempt")
    print()
    print("IMPORTANT: Test the editor before publishing.")
    print("Restore freedomwall.backup.html if anything behaves incorrectly.")


if __name__ == "__main__":
    main()
