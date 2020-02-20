//
// webext/background.js
//
import 'babel-polyfill'
const browser = require('webextension-polyfill')
const fraidyscrape = require('..')
console.log('Started web extension')

var defs = null

function innerHtml(node) {
  let v = node.value || node.nodeValue
  if (v) return v

  if (node.hasChildNodes())
  {
    v = ''
    for (let c = 0; c < node.childNodes.length; c++) {
      let n = node.childNodes[c]
      v += n.value || n.nodeValue || n.innerHTML
    }
  }
  return v
}

function xpath(doc, node, path, asText, ns) {
  let lookup = null
  if (ns) lookup = (pre) => ns[pre]
  let result = doc.evaluate(path, node, lookup, 4, null), list = []
  if (result) {
    while (true) {
      let node = result.iterateNext()
      if (node) {
        list.push(asText ? innerHtml(node) : node)
      } else {
        break
      }
    }
  }
  return list
}

browser.runtime.onMessage.addListener(async (msg) => {
  try {
    console.log(msg)

    if (defs === null) {
      var soc = await fetch("https://fraidyc.at/defs/social.json")
      defs = JSON.parse(await soc.text())
      console.log(defs)
    }

    let scraper = new fraidyscrape(defs, new DOMParser(), xpath,
      {useragent: 'X-FC-User-Agent'})
    let req, last, now = new Date()
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
      last.posts = last.posts.filter(a => a.updatedAt && a.updatedAt <= now).
        sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20)
    }

    return last
  } catch (e) {
    console.log(e)
  }
})

let extUrl = browser.extension.getURL("/")
function rewriteUserAgentHeader(e) {
  if (e.tabId === -1 && e.initiator && extUrl && extUrl.startsWith(e.initiator)) {
    let hdrs = [], ua = null
    for (var header of e.requestHeaders) {
      let name = header.name.toLowerCase()
      if (name === "x-fc-user-agent") {
        ua = header
      } else if (name !== "user-agent") {
        hdrs.push(header)
      }
    }

    if (ua !== null) {
      hdrs.push({name: 'User-Agent', value: ua.value})
      return {requestHeaders: hdrs}
    }
  }
  return {requestHeaders: e.requestHeaders}
}

browser.webRequest.onBeforeSendHeaders.addListener(rewriteUserAgentHeader,
  {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["blocking", "requestHeaders"])

browser.browserAction.onClicked.addListener(tab => {
  browser.tabs.create({url: 'https://fraidyc.at/scrape/'})
})
