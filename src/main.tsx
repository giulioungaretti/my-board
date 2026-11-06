import React from 'react'
import ReactDOM from 'react-dom/client'
import { TooltipProvider } from '@giulioungaretti/home-design-system'
import '@giulioungaretti/home-design-system/styles.css'
import './theme.css'
import './styles.css'
import { App } from './App.js'

const root = document.getElementById('root')
if (!root) throw new Error('The application root is missing.')
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
)
