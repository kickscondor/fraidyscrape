import 'regenerator-runtime/runtime'
const browser = require('webextension-polyfill')
const u = require('umbrellajs')

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

u('button').on('click', e => {
  let ele = e.currentTarget
  e.preventDefault()

  let url = u('input').first().value
  console.log(url)
  browser.runtime.sendMessage({url, at: new Date()}).
    then((msg) => {
      u('#response').html(escapeHtml(
        JSON.stringify(msg, null, 2) || "{}"))
    })
})
