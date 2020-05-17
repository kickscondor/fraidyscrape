//
// webext/background.js
//
import 'regenerator-runtime/runtime'
import { xpath, parseDom } from './util' 
const browser = require('webextension-polyfill')
const fraidyscrape = require('..')
console.log('Started web extension')

var defs = null, scraper

async function render(req, tasks) {
  let site = scraper.options[req.id]
  let iframe = document.createElement("iframe")
  iframe.src = req.url
  return new Promise((resolve, reject) => {
    iframe.addEventListener('load', e => {
      scraper.addWatch(req.url, {tasks, resolve, reject, iframe, render: req.render,
        remove: () => document.body.removeChild(iframe)})
      iframe.contentWindow.postMessage({url: req.url, tasks, site}, '*')
    })
    document.body.appendChild(iframe)
    setTimeout(() => scraper.removeWatch(req.url, scraper.watch[req.url]), 40000)
  })
}

window.addEventListener('message', e => {
  let {url, tasks, error} = e.data
  scraper.updateWatch(url, scraper.watch[url], tasks, error)
}, false)

function fixupHeaders (options, list) {
  if (options && options.headers) {
    let fix = {}
    for (let k in options.headers) {
      fix[(list.includes(k) ? 'X-FC-' : '') + k] = options.headers[k]
    }
    options.headers = fix
  }
  return options
}

browser.runtime.onMessage.addListener(async (msg) => {
  try {
    console.log(msg)

    if (defs === null) {
      var soc = await fetch("https://huh.fraidyc.at/defs/social.json")
      defs = JSON.parse(await soc.text())
      scraper = new fraidyscrape(defs, parseDom, xpath)
      console.log(defs)
    }

    let req, last, now = new Date()
    let tasks = scraper.detect(msg.url)
    console.log(tasks)

    while (req = scraper.nextRequest(tasks)) {
      console.log(req)
      if (req.render) {
        last = (await render(req, tasks)).out
      } else {
        let res = await fetch(req.url, fixupHeaders(req.options, ['Cookie', 'User-Agent']))
        // console.log(res)
        last = (await scraper.scrape(tasks, req, res)).out
      }
    }

    if (last.posts) {
      last.posts = last.posts.
        sort((a, b) => (b.updatedAt || b.publishedAt) - (a.updatedAt || a.publishedAt)).slice(0, 20)
    }

    return last
  } catch (e) {
    console.log(e)
  }
})

let extUrl = browser.extension.getURL("/")
function rewriteUserAgentHeader(e) {
  let initiator = e.initiator || e.originUrl
  if (e.tabId === -1 && initiator && extUrl && (initiator + "/").startsWith(extUrl)) {
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
  return {responseHeaders: headers}
}

browser.webRequest.onHeadersReceived.addListener(rewriteFrameOptHeader,
  {urls: ["<all_urls>"]}, ["blocking", "responseHeaders"])

async function checkCompleted(e) {
  let headers = e.responseHeaders
  if (e.tabId === -1 && e.parentFrameId === 0) {
    scraper.lookupWatch(e.url, async (r, tasks) => {
      let res = await fetch(e.url)
      try { await scraper.scrapeRule(tasks, res, r) } catch {}
    })
  }
}

browser.webRequest.onCompleted.addListener(checkCompleted,
  {urls: ["<all_urls>"], types: ["xmlhttprequest"]})

browser.browserAction.onClicked.addListener(tab => {
  browser.tabs.create({url: 'https://fraidyc.at/scrape/'})
})
