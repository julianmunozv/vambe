import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const nodo = document.getElementById('root')
if (!nodo) throw new Error('Falta #root en el HTML')
createRoot(nodo).render(<StrictMode><App /></StrictMode>)
