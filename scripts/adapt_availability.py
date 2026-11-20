import os

src = r"frontend\app\availability\page.tsx"
dst = r"frontend\components\scheduling\availability-tab.tsx"

with open(src, "r", encoding="utf-8") as f:
    content = f.read()

# Replace component name
content = content.replace("export default function AvailabilityPage() {", "export function AvailabilityTab() {")

# Remove AppShell
content = content.replace('<AppShell title="Availability">', '<div className="w-full space-y-6">')
content = content.replace("</AppShell>", "</div>")
content = content.replace('import { AppShell } from "@/components/layout/app-shell";\n', '')

with open(dst, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Wrote {os.path.getsize(dst)} bytes to {dst}")
