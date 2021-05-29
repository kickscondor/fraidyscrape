import 'regenerator-runtime/runtime'
import { xpath } from './util' 

if (window.self !== window.top) {
  const browser = require('webextension-polyfill')
  const fraidyscrape = require('..')

  let scraper = new fraidyscrape({}, new DOMParser(), xpath)
  let extURL = browser.extension.getURL('/').replace(/\/$/, '')

  window.addEventListener('message', async e => {
    let {tasks, site, url} = JSON.parse(e.data)
    let error = null
    try {
      await scraper.scrapeRender(tasks, site, window)
    } catch (e) {
      error = e.message + " " + e.fileName + ":" + e.lineNumber + ":" + e.columnNumber
    }
    e.source.postMessage(JSON.stringify({tasks, url, error}), extURL)
  })
}
