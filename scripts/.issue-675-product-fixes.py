from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"{path}: expected {expected} exact match(es), found {count}\n"
            f"--- expected seam ---\n{old[:1200]}"
        )
    file.write_text(text.replace(old, new))


replace(
    "src/components/QuickLogV2Sheet.tsx",
    "  const { grows } = useGrows();\n",
    "  const { grows = [] } = useGrows();\n",
)

print("Issue 675 presenter null-safety fix applied.")
