import 'regenerator-runtime/runtime'
import { xpath } from './util' 

if (window.self !== window.top) {
  const browser = require('webextension-polyfill')
  const fraidyscrape = require('..')

  let scraper = new fraidyscrape({}, new DOMParser(), xpath)
  let extURL = browser.extension.getURL('/').replace(/\/$/, '')

  window.addEventListener('message', async e => {
    let {tasks, site, url} = e.data
    let error = null
    try {
      await scraper.scrapeRender(tasks, site, window)
    } catch {
      error = "Couldn't find a follow at this location."
    }
    e.source.postMessage({tasks, url, error}, extURL)
  })
}
