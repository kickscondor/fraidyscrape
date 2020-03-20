import 'regenerator-runtime/runtime'
const browser = require('webextension-polyfill')
const ppj = require('pretty-print-json')
const u = require('umbrellajs')

u('button').on('click', e => {
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
})
