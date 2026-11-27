import re
from pathlib import Path

TARGET = Path("freedomwall.html")
html = TARGET.read_text(encoding="utf-8")

old_block = """async function postReactionToggle(id, type) {
                                                                const res = await fetch(GAS_WEB_APP_URL, {
                                                                    method: "POST",
                                                                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                                                                    body: JSON.stringify({ action: "reactFreedomWall", id, type, voter: voterId })
                                                                });
                                                                const j = await res.json();
                                                                if (!j.ok) throw new Error(j.error || "failed");
                                                                return j;
                                                            }"""

new_block = """async function postReactionToggle(id, type) {
                                                                const cleanId = String(id || "").trim();
                                                                const cleanReaction = String(type || "").trim();
                                                                if (!cleanId || !cleanReaction) throw new Error("Missing entry ID or reaction.");
                                                                const res = await fetch(GAS_WEB_APP_URL, {
                                                                    method: "POST",
                                                                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                                                                    body: JSON.stringify({
                                                                        action: "reactFreedomWall",
                                                                        id: cleanId,
                                                                        entryId: cleanId,
                                                                        reaction: cleanReaction,
                                                                        type: cleanReaction,
                                                                        voter: voterId
                                                                    })
                                                                });
                                                                const j = await res.json();
                                                                if (!j.ok) throw new Error(j.error || "failed");
                                                                return j;
                                                            }"""

if old_block in html:
    updated = html.replace(old_block, new_block, 1)
else:
    # Fallback regex match in case indentation differs
    pattern = re.compile(
        r'async function postReactionToggle\s*\(\s*id\s*,\s*type\s*\)\s*\{[\s\S]*?body:\s*JSON\.stringify\(\{\s*action:\s*"reactFreedomWall",\s*id,\s*type,\s*voter:\s*voterId\s*\}\)[\s\S]*?return j;\s*\}'
    )
    updated, count = pattern.subn(new_block.strip(), html, count=1)
    if count == 0:
        raise RuntimeError("Could not find postReactionToggle(id, type) in freedomwall.html")

TARGET.write_text(updated, encoding="utf-8")
print("Patched freedomwall.html successfully! postReactionToggle now sends id, entryId, reaction, and type.")