//
// webext/background.js
//
import 'babel-polyfill'
const browser = require('webextension-polyfill')
const dom = new DOMParser()
const fraidyscrape = require('..')
const xpath = require('xpath')
console.log('Started web extension')

var defs = null

browser.runtime.onMessage.addListener(async (msg) => {
  console.log(msg)

  if (defs === null) {
    var soc = await fetch("https://fraidyc.at/defs/social.json")
    defs = JSON.parse(await soc.text())
    console.log(defs)
  }

  let scraper = new fraidyscrape(defs, {
    parseHtml: str => {
      try {
        return dom.parseFromString(str, 'text/html')
      } catch {
        return dom.parseFromString(str, 'text/xml')
      }
    },
    searchHtml: (node, path, asText, namespaces) => {
      if (!(path instanceof Array)) {
        path = [path]
      }
      for (let i = 0; i < path.length; i++) {
        let p = path[i]
        try {
          let x = xpath.parse(p).select({node, allowAnyNamespaceForNoPrefix: true,
            caseInsensitive: true, namespaces})
          if (x) {
            if (asText) {
              return x.map(node => node.textContent).join('').trim()
            }
            return x
          }
        } catch (e) {
          return asText ? "" : []
        }
      }
    }
  })

  let req, last
  console.log(scraper)
  let tasks = scraper.detect(msg.url)
  console.log(tasks)

  while (req = scraper.nextRequest(tasks)) {
		console.log(req)
		let res = await fetch(req.url, req.options)
		// console.log(res)
		let obj = await scraper.scrape(tasks, req, res)
		last = obj.out
  }

  if (last.posts) {
    last.posts = last.posts.filter(a => 'updatedAt' in a).
      sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)
  }

  return new Promise((resolve, _) => resolve(last))
})

let extUrl = browser.extension.getURL("/")
function rewriteUserAgentHeader(e) {
  if (defs && e.tabId === -1 && e.initiator && extUrl && extUrl.startsWith(e.initiator)) {
    for (var header of e.requestHeaders) {
      if (header.name.toLowerCase() === "user-agent") {
        header.value = defs.agent
      }
    }
  }
  return {requestHeaders: e.requestHeaders}
}

browser.webRequest.onBeforeSendHeaders.addListener(rewriteUserAgentHeader,
  {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["blocking", "requestHeaders"])

browser.browserAction.onClicked.addListener(tab => {
  browser.tabs.create({url: 'index.html'})
})
