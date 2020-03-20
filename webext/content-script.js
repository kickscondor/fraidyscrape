import 'regenerator-runtime/runtime'
import { xpath } from './util' 

if (window.self !== window.top) {
  const browser = require('webextension-polyfill')
  const fraidyscrape = require('..')

  let extURL = browser.extension.getURL('/').replace(/\/$/, '')
  let scraper = new fraidyscrape({}, new DOMParser(), xpath)
  window.addEventListener('message', async e => {
    let {tasks, id, site} = e.data
    console.log(e.data)
    let vars = await scraper.scrapeRender(tasks, id, site, document)
    console.log(vars)
    e.source.postMessage(vars, extURL)
  })
}
