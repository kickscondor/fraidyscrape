//
// Fraidyscrape
//
// import fraidyscrape from './fraidyscrape'
// var scraper = new fraidyscrape(options)
// scraper.
//
// const { JSONPath } = require('jsonpath-plus')
const jp = require('jsonpath')
const normalizeUrl = require('normalize-url')
const urlp = require('url')

module.exports = F

function F (options, ext) {
  if (!(this instanceof F)) return new F (options, ext)
  for (let id in options) {
    let site = options[id]
    if (site.match) {
      site.match = new RegExp(site.match)
    }
  }
  this.options = options
  Object.assign(this, ext)
}

function urlToNormal (link) {
  return normalizeUrl(link, {stripProtocol: true, removeDirectoryIndex: true, stripHash: true})
}

F.prototype.detect = function (url) {
  for (let id in this.options) {
    let site = this.options[id], match = null, norm = urlToNormal(url)
    if (!site.match || !(match = norm.match(site.match)))
      continue

    let vars = {url}
    if (site.arguments) {
      for (let i = 0; i < site.arguments.length; i++) {
        let v = site.arguments[i]
        if (typeof(v) === 'string') {
          vars[v] = match[i]
        } else if (typeof(v) === 'object') {
          vars[v.var] = match[i]
        }
      }
    }

    let queue = (site.depends || []).concat([id])
    return {queue, vars}
  }
  return {queue: ["default"], vars: {url}}
}

function varx(str, vars) {
  return typeof(str) === 'string' ? str.replace(/\$(\w+)/g, x => {
    let k = x.slice(1)
    return (k in vars ? vars[k] : x)
  }) : str
}

F.prototype.assign = function (options, additions, vars, mods) {
  for (let id in additions) {
    let val = additions[id]
    if (!val) continue

    let keys = id.split(':'), node = options
    while (keys.length > 1) {
      if (typeof(node[keys[0]]) !== 'object') {
        node[keys[0]] = {}
      }
      node = node[keys[0]]
      keys.shift()
    }

    val = varx(val, vars)
    if (typeof(mods) === 'object') {
      for (let i in mods) {
        let trans = mods[i]
        if (trans === 'date') {
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
  let req = this.options[id]
  let headers = {}
  if (this.options.agent) {
    headers['User-Agent'] = this.options.agent
  }
  let options = this.assign({},
    {url: req.url || tasks.vars.url, headers, credentials: 'omit'},
    tasks.vars)
  if (this.options.domains) {
    this.assign(options, this.options.domains[urlp.parse(options.url).hostname],
      tasks.vars)
  }

  // TODO: Actually batch
  if (req.batch) {
    let mods = req.batch[1]
    this.assign(options, mods, tasks.vars)
  }

  let url = urlp.parse(options.url)
  url.query = options.query
  delete options.url
  delete options.query
  return {url: urlp.format(url), id, options}
}

//
// Run a series of commands, populating 'vars'.
//
// vars: The hash to store output in.
// script: The list of commands.
// gg: Global settings
// pathFn: The function to use for xpath or jsonpath or whatever.
//
//
F.prototype.scanScript = async function (vars, script, gg, node, pathFn) {
  for (let i = 0; i < script.length; i++) {
    let cmd = script[i]
    let ops = cmd.op
    if (ops && !(ops instanceof Array))
      ops = [ops]
    for (let j = 0; j < ops.length; j++) {
      let op = varx(ops[j], vars)
      let hasChildren = cmd.acceptJson || cmd.acceptHtml || cmd.acceptXml || cmd.use
      let val = op[0] === '=' ? op.slice(1) : pathFn(op, !(hasChildren && !cmd.match))
      if (cmd.match && val.match && (match = val.match(new RegExp(cmd.match))) !== null) {
        val = match[1]
      }
      if (cmd.use && val.length > 0) {
        let site = this.options[cmd.use]
        return await this.scan(vars, site, site, node)
      }

      //
      // If there is a nested ruleset, process it.
      //
      if (hasChildren) {
        let v = vars
        if (cmd.var) {
          vars = Object.assign({}, vars)
          delete vars.out
        } else if (val instanceof Array) {
          val = val.shift()
        }
        if (val) {
          await this.scan(vars, cmd, gg, val)
          if (cmd.var) {
            val = vars.out
            vars = v
          }
        }
      }

      //
      // See 'assign' method above.
      //
      if (cmd.var) {
        this.assign(vars, {[cmd.var]: val}, vars, cmd.mod)
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
// gg: The global ruleset for this site.
// obj: The document to scan.
//
F.prototype.scan = async function (vars, site, gg, obj) {
  let fn = null, script = null
  if (site.accept) {
    for (let i = 0; i < site.accept.length; i++) {
      await this.scan(vars, this.options[site.accept[i]], gg, obj)
      if (vars.out)
        break
    }
    return vars
  } else if (site.acceptJson) {
    if (typeof(obj) === 'string')
      obj = JSON.parse(obj, jsonDateParser)
    script = site.acceptJson
    fn = (path) => {
      // let found = JSONPath({path, json: obj})
      // return found && found[0]
      return jp.value(obj, path)
    }

  } else if (site.acceptHtml || site.acceptXml) {
    if (typeof(obj) === 'string')
      obj = this.parseHtml(obj)
    script = site.acceptHtml || site.acceptXml
    fn = (path, asText) => this.searchHtml(obj, path, asText, gg.namespaces)
  }

  if (obj instanceof Array) {
    let out = []
    delete vars.out
    for (let i = 0; i < obj.length; i++) {
      let v = Object.assign({}, vars)
      this.scan(v, site, gg, obj[i])
      out.push(v.out)
    }
    vars.out = out
  } else if (fn) {
		await this.scanScript(vars, script, gg, obj, fn)
  }
	return vars
}

F.prototype.scrape = async function (tasks, req, res) {
  let site = this.options[req.id]
  let vars = await this.scan(tasks.vars, site, site, await res.text())
  vars.rule = req.id
  return vars
}
