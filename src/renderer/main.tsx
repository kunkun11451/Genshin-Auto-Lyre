import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CalibrationHUD } from './components/CalibrationHUD'
import './index.css'
import './i18n'

const isCalibrationHud = window.location.hash === '#calibration-hud'

if (isCalibrationHud) {
  document.documentElement.style.background = 'transparent'
  document.documentElement.style.backgroundColor = 'transparent'
  document.body.style.background = 'transparent'
  document.body.style.backgroundColor = 'transparent'
  document.body.style.overflow = 'hidden'
  const rootEl = document.getElementById('root')
  if (rootEl) {
    rootEl.style.background = 'transparent'
    rootEl.style.backgroundColor = 'transparent'
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isCalibrationHud ? <CalibrationHUD isStandalone={true} /> : <App />}
  </React.StrictMode>
)
