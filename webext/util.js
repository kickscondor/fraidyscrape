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

