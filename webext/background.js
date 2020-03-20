//
// webext/background.js
//
import 'regenerator-runtime/runtime'
import { xpath } from './util' 
const browser = require('webextension-polyfill')
const fraidyscrape = require('..')
console.log('Started web extension')

var defs = null
var watch = []

async function render(url, id, site, tasks) {
  let ifrm = document.createElement("iframe")
  ifrm.src = url
  ifrm.addEventListener('load', e => {
    ifrm.contentWindow.postMessage({tasks, id, site}, '*')
  })
  document.body.appendChild(ifrm)
}

browser.runtime.onMessage.addListener(async (msg) => {
  try {
    console.log(msg)

    if (defs === null) {
      var soc = await fetch("https://huh.fraidyc.at/defs/social.json")
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
      if (req.render) {
        let ary = req.render.map(id => scraper.options[id])
        watch.push(ary)
        last = (await render(req.url, req.id, scraper.options[req.id], tasks)).out
      } else {
        let res = await fetch(req.url, req.options)
        // console.log(res)
        last = (await scraper.scrape(tasks, req, res)).out
      }
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

function rewriteFrameOptHeader(e) {
  let initiator = e.initiator || e.originUrl
  let headers = e.responseHeaders
  if (e.tabId === -1 && initiator && extUrl && (initiator + "/").startsWith(extUrl)) {
    for (let i = headers.length - 1; i >= 0; --i) {
      let header = headers[i].name.toLowerCase()
      if (header == 'x-frame-options' || header == 'frame-options') {
        headers.splice(i, 1)
      }
    }
  }
  return {responseHeaders: headers};
}

browser.webRequest.onHeadersReceived.addListener(rewriteFrameOptHeader,
  {urls: ["<all_urls>"]}, ["blocking", "responseHeaders"])

function checkCompleted(e) {
  let headers = e.responseHeaders
  // TODO: match frame id
  if (e.tabId === -1 && e.parentFrameId === 0) {
    let url = urlToNormal(e.url)
    for (let renders of watch) {
      let match = renders.filter(render => url.match(render.match))
      if (match) {
      }
    }
  }
}

browser.webRequest.onCompleted.addListener(checkCompleted,
  {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["responseHeaders"])

browser.browserAction.onClicked.addListener(tab => {
  browser.tabs.create({url: 'https://fraidyc.at/scrape/'})
})
