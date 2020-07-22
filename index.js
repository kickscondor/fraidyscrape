//
// Fraidyscrape
//
// import fraidyscrape from './fraidyscrape'
// var scraper = new fraidyscrape(options)
// scraper.
//
const jp = require('jsonpath')
const normalizeUrl = require('normalize-url')
const urlp = require('url')
const unkZones = require('./unkZones.js')

module.exports = F

function F (options, parser, xpath, vars) {
  if (!(this instanceof F)) return new F (options, parser, xpath, vars)
  for (let id in options) {
    let site = options[id]
    if (site.match) {
      site.match = new RegExp(site.match)
    }
    if (site.render) {
      for (let r of site.render) {
        if (r.match) {
          r.match = new RegExp(r.match)
        }
      }
    }
  }
  this.options = options
  this.parser = parser
  this.xpath = xpath
  this.vars = vars || {}
  this.watch = {}
}

F.prototype.parseHtml = function (str, mimeType) {
  return this.parser(str, mimeType)
}

F.prototype.searchHtml = function (node, path, asText, vars) {
  if (!(path instanceof Array)) {
    path = [path]
  }
  for (let i = 0; i < path.length; i++) {
    let p = path[i]
    try {
      let list = this.xpath(vars.doc, node, p, asText, vars.namespaces)
      return asText ? list.join('').trim() : list
    } catch (e) {
    }
  }
  return asText ? "" : []
}

async function responseToObject (resp) {
  let headers = {}   
  let body = await resp.text()
  for (let h of resp.headers) 
    headers[h[0].toLowerCase()] = h[1]
  return {status: resp.status, ok: resp.ok, url: resp.url, body, headers}  
}  

function urlToNormal (link) {
  return normalizeUrl(link, {stripProtocol: true, removeDirectoryIndex: true, stripHash: true})
}

F.prototype.addWatch = function (url, entry) {
  this.watch[url] = entry
}

F.prototype.removeWatch = function(url) {
  let entry = this.watch[url]
  if (entry) {
    if (entry.resolve) {
      entry.resolve(entry.tasks ? entry.tasks.vars : {})
    }
    delete this.watch[url]
    entry.remove()
  }
}

F.prototype.updateWatch = function(url, tasks, error) {
  let entry = this.watch[url]
  if (entry) {
    entry.tasks = tasks
    if (error) {
      entry.reject(error)
      delete entry.resolve
    }
    if (entry.render.length === 0 || error) {
      this.removeWatch(url)
    }
  }
}

F.prototype.lookupWatch = async function (url, fn) {
  let norm = urlToNormal(url)
  for (let wurl in this.watch) {
    let w = this.watch[wurl]
    for (let r of w.render) {
      if (r.match) {
        let m = norm.match(r.match)
        if (m && (!r.validate ||
          r.validate.map(v => w.tasks.vars[v]).join("|") === m.slice(1).join("|")))
        {
          await fn(r, w.tasks)
          w.render = w.render.filter(wr => wr !== r)
          this.updateWatch(wurl, w.tasks)
        }
      }
    }
  }
}

F.prototype.detect = function (url) {
  for (let id in this.options) {
    let site = this.options[id], match = null, norm = urlToNormal(url)
    if (!site.match || !(match = norm.match(site.match)))
      continue

    let vars = Object.assign({url}, this.vars)
    if (site.arguments) {
      for (let i = 0; i < site.arguments.length; i++) {
        let v = site.arguments[i]
        if (typeof(v) === 'string') {
          vars[v] = match[i]
        } else if (typeof(v) === 'object') {
          this.assign(vars, {[v.var]: match[i]}, vars, v.mod, true)
        }
      }
    }

    let queue = (site.depends || []).concat([id])
    return {queue, vars}
  }
  return {queue: ["default"], vars: {url}}
}

function varr(vars, x) {
  let k = x.split(':')
  while (vars && k.length > 0) {
    vars = vars[k.shift()]
  }
  return vars || ''
}

function varx(str, vars) {
  return typeof(str) === 'string' ? str.replace(/\${(.+)}/g, x => {
    let k = x.slice(2, -1)
    let v = `${varx(k, vars)}`
    return varr(vars, v)
  }).replace(/\$([:\w]+)/g, x => varr(vars, x.slice(1))) : str
}

F.prototype.assign = function (options, additions, vars, mods, plainValue) {
  for (let id in additions) {
    let val = additions[id]
    id = varx(id, vars)
    let keys = id.split(':'), node = options
    while (keys.length > 1) {
      if (typeof(node[keys[0]]) !== 'object') {
        node[keys[0]] = {}
      }
      node = node[keys[0]]
      keys.shift()
    }

    if (!val) {
      delete node[keys[0]]
      continue
    }

    if (!plainValue)
      val = varx(val, vars)
    if (typeof(mods) === 'object') {
      for (let i in mods) {
        let trans = mods[i], match
        if (trans === 'date') {
          if (typeof(val) === 'string') {
            if (val.match(/^\d{14,}/)) {
              val = val.slice(0,4) + "-" + val.slice(4,6) + "-" + val.slice(6,8) +
                " " + val.slice(8,10) + ":" + val.slice(10,12) + ":" + val.slice(12,14) + "Z"
            } else if ((match = val.match(/^(.+) ([A-Z]{1,5})$/)) !== null) {
              let z = unkZones[match[2]]
              if (z) {
                val = match[1] + " " + unkZones[match[2]]
              }
            }
          }
          val = new Date(val)
        } else if (trans === 'int') {
          val = Number(val)
        } else if (trans === 'slug') {
          val = '#' + encodeURIComponent(val)
        } else if (trans === 'url') {
          val = urlp.resolve(vars['url'], val)
        } else if (trans.startsWith('valid-now')) {
          let d = new Date(), field = trans.split(':')[1]
          val = val.filter(x => x[field] < d)
        } else if (trans.startsWith('*')) {
          val = val * Number(trans.slice(1))
        } else if (trans === 'lowercase') {
          val = val.toString().toLowerCase()
        } else if (trans === 'uppercase') {
          val = val.toString().toUpperCase()
        }
			}
		}
    node[keys[0]] = val
  }
  return options
}

F.prototype.nextRequest = function (tasks) {
  if (tasks.queue.length == 0)
    return

  let id = tasks.queue.shift()
  let req = this.setupRequest(tasks, this.options[id])
  req.id = id
  return req
}

F.prototype.setupRequest = function (tasks, req) {
  let options = this.assign({},
    {url: req.url || tasks.vars.url, headers: {}, credentials: 'omit'},
    tasks.vars)
  if (this.options.domains) {
    this.assign(options, this.options.domains[urlp.parse(options.url).hostname],
      tasks.vars)
  }

  if (req.request) {
    this.assign(options, req.request, tasks.vars)
  }

  let url = urlp.parse(options.url)
  url.query = options.query
  delete options.url
  delete options.query
  return {url: urlp.format(url), options,
    render: req.render && req.render.concat()}
}

//
// Run a series of commands, populating 'vars'.
//
// vars: The hash to store output in.
// script: The list of commands.
// node: The parent node to scan.
// pathFn: The function to use for xpath or jsonpath or whatever.
//
//
F.prototype.scanScript = async function (vars, script, node, pathFn) {
  for (let i = 0; i < script.length; i++) {
    let cmd = script[i]
    if (cmd.rule) {
      let rule = vars.rules && vars.rules[cmd.rule]
      if (rule) {
        await this.scanScript(vars, rule, node, pathFn)
      }
    }

    let ops = cmd.op
    if (!(ops instanceof Array))
      ops = [ops]
    for (let j = 0; j < ops.length; j++) {
      let op = varx(ops[j], vars)
      let val = null
      if (op) {
        let hasChildren = cmd.acceptJson || cmd.acceptHtml || cmd.acceptXml || cmd.patch || cmd.use
        val = op[0] === '=' ? op.slice(1) : pathFn(op, !(hasChildren && !cmd.match))
        if (cmd.match) {
          if (val.match && (match = val.match(new RegExp(cmd.match))) !== null) {
            val = match[1] || val
          } else {
            continue
          }
        }
        if (this.options && cmd.use && val.length > 0) {
          let use = this.options[cmd.use]
          return await this.scanSite(vars, use, node)
        }

        //
        // If there is a nested ruleset, process it.
        //
        if (hasChildren) {
          let v = vars
          if (cmd.var) {
            if (cmd.var !== "*") {
              vars = Object.assign({}, vars)
              delete vars.out
            }
          } else if (val instanceof Array) {
            val = val.shift()
          }
          if (val) {
            await this.scan(vars, cmd, val)
            if (cmd.var) {
              if (cmd.var !== "*") {
                val = vars.out
                vars = v
              }
            }
          }
        }
      }

      //
      // See 'assign' method above.
      //
      if (cmd.var && cmd.var !== "*") {
        this.assign(vars, {[cmd.var]: val}, vars, cmd.mod, true)
      }

      //
      // If object contains anything at all, no need to run
      // further ops in a chain.
      //
      if (val instanceof Array) {
        if (val.length > 0)
          break
      } else if (val && Object.entries(val).length > 0) {
        break
      }
    }
  }
}

var reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.{0,1}\d*))(?:Z|(\+|-)([\d|:]*))?$/;

function jsonDateParser(_, value) {
	var parsedValue = value;
	if (typeof value === 'string') {
		var a = reISO.exec(value);
		if (a) {
			parsedValue = new Date(value);
		}
  }
	return parsedValue;
}

//
// Scan a document (HTML or JSON) following a site ruleset.
//
// vars: A hash to use for storage.
// site: The ruleset to use.
// obj: The document to scan.
//
F.prototype.scan = async function (vars, site, obj) {
  let script = null
  let fn = (path, asText) => jp[asText ? 'value' : 'query'](obj, path)
  if (site.accept) {
    for (let i = 0; i < site.accept.length; i++) {
      await this.scanSite(vars, this.options[site.accept[i]], obj)
      if (vars.out)
        break
    }
  }

  if (site.acceptJson) {
    if (obj.innerHTML) {
      obj = obj.innerHTML
    }
    if (typeof(obj) === 'string') {
      vars.mime = 'application/json'
      obj = JSON.parse(obj, jsonDateParser)
    } else if (!vars.mime) {
      vars.mime = 'application/json'
    } else if (vars.mime !== 'application/json') {
      return vars
    }
    script = site.acceptJson
  } else if (site.acceptHtml || site.acceptXml) {
    if (typeof(obj) === 'string') {
      vars.mime = site.acceptHtml ? 'text/html' : 'text/xml'
    } else if (!vars.mime) {
      vars.mime = site.acceptHtml ? 'text/html' : 'text/xml'
    } else if (vars.mime === 'application/json') {
      return vars
    }
    script = site.acceptHtml || site.acceptXml
    fn = (path, asText) => this.searchHtml(obj, path, asText, vars)
  } else if (site.patch) {
    script = site.patch
    if (!site.op)
      obj = vars.out
  }

  if (script) {
    if (obj instanceof Array) {
      let out = []
      if (site.var !== "*")
        delete vars.out
      for (let i = 0; i < obj.length; i++) {
        let v = (site.var === "*" ? vars : Object.assign({}, vars))
        await this.scan(v, site, obj[i])
        if (site.var !== "*")
          out.push(v.out)
      }
      if (site.var !== "*")
        vars.out = out
    } else if (fn) {
      setTimeout(() => {1}, 0)
      await this.scanScript(vars, script, obj, fn)
    }
  }

	return vars
}

F.prototype.scanSite = async function (vars, site, obj) {
  let oldNs = vars.namespaces, oldRules = vars.rules
  vars.namespaces = site.namespaces
  vars.rules = site.rules

  let v = await this.scan(vars, site, obj)
  vars.namespaces = oldNs
  vars.rules = oldRules
  return v
}

F.prototype.scrapeRule = async function (tasks, res, site) {
  res = await responseToObject(res)

  let mime = res.headers['content-type']
  if (/^\s*[{\[]/.test(res.body)) {
    tasks.vars.doc = JSON.parse(res.body, jsonDateParser)
    if (tasks.vars.doc instanceof Array) {
      tasks.vars.doc = {list: tasks.vars.doc}
    }
    mime = 'application/json'
  } else {
    // The [\s\S] matches ANY char - while the dot (,) doesn't match newlines
    if (/^\s*<\?xml\s+[\s\S]+<(rss|atom)/i.test(res.body)) {
      mime = 'text/xml'
    }
    tasks.vars.doc = this.parseHtml(res.body, /html/.test(mime) ? 'text/html' : 'text/xml')
  }
  tasks.vars.mime = mime
  // console.log([tasks, res, site])

  let vars = await this.scanSite(tasks.vars, site, tasks.vars.doc)
  delete tasks.vars.doc
  return vars
}

F.prototype.scrape = async function (tasks, req, res) {
  let site = this.options[req.id]
  let vars = await this.scrapeRule(tasks, res, site)
  vars.rule = req.id
  return vars
}

F.prototype.scrapeRender = async function (tasks, site, win) {
  tasks.vars.doc = site.acceptJson ? win : win.document
  let vars = await this.scanSite(tasks.vars, site, tasks.vars.doc)
  delete tasks.vars.doc
  return vars
}
