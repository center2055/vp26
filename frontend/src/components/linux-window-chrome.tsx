import { useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function LinuxWindowChrome() {
  const [isFocused, setIsFocused] = useState(true)

  useEffect(() => {
    const currentWindow = getCurrentWindow()
    let unlisten: (() => void) | undefined

    void currentWindow.isFocused().then(setIsFocused).catch(() => {
      setIsFocused(true)
    })

    void currentWindow
      .onFocusChanged(({ payload }) => {
        setIsFocused(payload)
      })
      .then((dispose) => {
        unlisten = dispose
      })

    return () => {
      unlisten?.()
    }
  }, [])

  async function handleMinimize() {
    await getCurrentWindow().minimize()
  }

  async function handleToggleMaximize() {
    await getCurrentWindow().toggleMaximize()
  }

  async function handleClose() {
    await getCurrentWindow().close()
  }

  return (
    <header className={isFocused ? 'linux-window-chrome' : 'linux-window-chrome is-blurred'}>
      <div className="linux-window-chrome__spacer" aria-hidden="true" />

      <div
        className="linux-window-chrome__drag"
        data-tauri-drag-region
        onDoubleClick={() => void handleToggleMaximize()}
      >
        <span className="linux-window-chrome__title">VP26</span>
      </div>

      <div className="linux-window-chrome__controls">
        <button
          type="button"
          className="linux-window-chrome__control"
          aria-label="Fenster minimieren"
          title="Minimieren"
          onClick={() => void handleMinimize()}
        >
          <Minus />
        </button>
        <button
          type="button"
          className="linux-window-chrome__control"
          aria-label="Fenster maximieren"
          title="Maximieren"
          onClick={() => void handleToggleMaximize()}
        >
          <Square />
        </button>
        <button
          type="button"
          className="linux-window-chrome__control linux-window-chrome__control--close"
          aria-label="Fenster schließen"
          title="Schließen"
          onClick={() => void handleClose()}
        >
          <X />
        </button>
      </div>
    </header>
  )
}
