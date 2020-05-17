const ent = require('ent/decode')

function innerHtml(node) {
  let v = node.value || (node.nodeValue && ent(node.nodeValue))
  if (v) return v

  if (node.hasChildNodes())
  {
    v = ''
    for (let c = 0; c < node.childNodes.length; c++) {
      let n = node.childNodes[c]
      v += n.value || (n.nodeValue && ent(n.nodeValue)) || n.innerHTML
    }
  }
  return v
}

export function xpath(doc, node, path, asText, ns) {
  let lookup = null
  if (ns) lookup = (pre) => ns[pre]
  let result = doc.evaluate(path, node, lookup, 7, null), list = []
  for (let i = 0; i < result.snapshotLength; i++) {
    let node = result.snapshotItem(i)
    if (node) {
      list.push(asText ? innerHtml(node) : node)
    } else {
      break
    }
  }
  return list
}

export function parseDom(str, mime) {
  return (new DOMParser()).parseFromString(str, mime)
}
