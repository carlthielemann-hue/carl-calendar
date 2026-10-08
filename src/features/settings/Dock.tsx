import { ClipboardCopy, Download, PanelRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Segmented, Select } from '@/components/ui'
import { BROWSERS, DOCK_SCRIPT, SHORTCUT_NAME, dock, dockAvailable, isMac, setDockPrefs, useDockPrefs } from '@/lib/dock'
import { Row, Section, Toggle } from './ui'

function downloadText(text: string, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Mac: Claude / ChatGPT / Manus as a docked right-hand sidebar next to Command Center. */
export function DockSection() {
  const p = useDockPrefs()
  if (!isMac()) return null
  return (
    <Section icon={<PanelRight />} title="Docked AI sidebar (Mac)" sub="Optional. The AI buttons already open the desktop apps; this extra step makes them snap into a sidebar next to Command Center.">
      <div className="px-5 py-3.5 text-[12.5px] leading-relaxed text-fg-2">
        <div className="mb-1.5 text-[13px] font-medium text-fg">One-time setup (≈3 minutes)</div>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Install the desktop apps you want: Claude (claude.ai/download), ChatGPT (chatgpt.com/download). Manus opens as a slim browser window.</li>
          <li>
            Open the <b>Shortcuts</b> app → <b>New Shortcut</b> → name it exactly <b>{SHORTCUT_NAME}</b>.
          </li>
          <li>
            Add the action <b>Run AppleScript</b>, delete its sample text and paste the script (button below). If the action shows an input field, set it to <b>Shortcut Input</b>.
          </li>
          <li>
            Run it once from Shortcuts, then allow it: System Settings → Privacy &amp; Security → <b>Accessibility</b> → turn on Shortcuts (and allow “System Events” if asked).
          </li>
          <li>Come back, switch on “Shortcut installed” and press a Dock button. Your browser asks once to open Shortcuts — tick “always allow”.</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              navigator.clipboard.writeText(DOCK_SCRIPT).then(
                () => toast.success('Script copied', { description: `Paste it into the “${SHORTCUT_NAME}” shortcut.` }),
                () => toast.error('Copy blocked — use Download instead'),
              )
            }
          >
            <ClipboardCopy className="h-3.5 w-3.5" /> Copy script
          </Button>
          <Button variant="ghost" onClick={() => downloadText(DOCK_SCRIPT, 'dock-ai.applescript')}>
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>
      <Row label="Shortcut installed" hint="Without it, the AI buttons simply open the apps. With it, they also snap them into a right-hand sidebar.">
        <Toggle checked={p.ready} onChange={(v) => setDockPrefs({ ready: v })} label="Shortcut installed" />
      </Row>
      <Row label="Command Center runs in" hint="So the script resizes the right window. Detected automatically; an installed Command Center app window is found on its own.">
        <Select value={p.browser} onChange={(e) => setDockPrefs({ browser: e.target.value })} className="w-[170px]" aria-label="Browser">
          {BROWSERS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
      </Row>
      <Row label="Sidebar width">
        <Segmented
          value={String(p.width)}
          onChange={(v) => setDockPrefs({ width: Number(v) })}
          options={['25', '30', '35', '40'].map((v) => ({ value: v, label: `${v}%` }))}
        />
      </Row>
      {p.ready && dockAvailable() && (
        <div className="flex flex-wrap gap-2 px-5 py-3.5">
          <Button size="sm" variant="secondary" onClick={() => dock('Claude')}>
            Dock Claude
          </Button>
          <Button size="sm" variant="secondary" onClick={() => dock('ChatGPT')}>
            Dock ChatGPT
          </Button>
          <Button size="sm" variant="secondary" onClick={() => dock('Manus')}>
            Dock Manus
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dock('Undock')}>
            Undock
          </Button>
        </div>
      )}
      <p className="px-5 pb-3.5 text-[11.5px] text-faint">Tip: connect each app to Command Center (AI connections above) so the docked chat can read and update your data. On iPhone, use the apps side by side via the app switcher.</p>
    </Section>
  )
}
