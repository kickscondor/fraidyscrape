import 'babel-polyfill'
const browser = require('webextension-polyfill')
const ppj = require('pretty-print-json')
const u = require('umbrellajs')

async function callFetch(e) {
  let ele = e.currentTarget
  e.preventDefault()
  ele.disabled = true

  let url = u('input').first().value
  console.log(url)
  browser.runtime.sendMessage({url, at: new Date()}).
    then((msg) => {
      u('#response').html(ppj.toHtml(msg))
      ele.disabled = false
    })
}

window.addEventListener("load", async () => {
  u('button').on('click', callFetch)
}, false)
