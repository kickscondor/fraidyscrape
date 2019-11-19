//
// Fraidyscrape
//
// import fraidyscrape from './fraidyscrape'
// var scraper = new fraidyscrape(options)
// scraper.
//
const { JSONPath } = require('jsonpath-plus')
const normalizeUrl = require('normalize-url')
const urlp = require('url')

module.exports = F

function F (options, ext) {
  if (!(this instanceof F)) return new F (options)
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
}

function varx(str, vars) {
  return typeof(str) === 'string' ? str.replace(/\$(\w+)/g, x => vars[x.slice(1)]) : str
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
        } else if (trans === 'url') {
          val = urlp.resolve(vars['url'], val)
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
  let options = this.assign({}, {url: req.url || tasks.vars.url}, tasks.vars)
  if (this.options.domains) {
    this.assign(options, this.options.domains[urlp.parse(options.url).hostname], tasks.vars)
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

F.prototype.scanScript = function (vars, script, pathFn) {
  for (let i = 0; i < script.length; i++) {
    let cmd = script[i]
    let op = varx(cmd.op, vars)
    let val = op[0] === '=' ? op.slice(1) : pathFn(op)
    if (cmd.match && val && (match = val.match(new RegExp(cmd.match))) !== null) {
      val = match[1]
    }
    if (cmd.acceptJson || cmd.acceptHtml || cmd.acceptXml) {
      let v = vars
      if (cmd.var) {
        vars = Object.assign({}, vars)
        delete vars.out
      }
      this.scan(vars, cmd, val)
      if (cmd.var) {
        val = vars.out
        vars = v
      }
    }
    if (cmd.var)
			this.assign(vars, {[cmd.var]: val}, vars, cmd.mod)
  }
}

var reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.{0,1}\d*))(?:Z|(\+|-)([\d|:]*))?$/;
var reMsAjax = /^\/Date\((d|-|.*)\)[\/|\\]$/;

function jsonDateParser(_, value) {
	var parsedValue = value;
	if (typeof value === 'string') {
		var a = reISO.exec(value);
		if (a) {
			parsedValue = new Date(value);
		} else {
			a = reMsAjax.exec(value);
			if (a) {
				var b = a[1].split(/[-+,.]/);
				parsedValue = new Date(b[0] ? +b[0] : 0 - +b[1]);
			}
		}
	}
	return parsedValue;
}

F.prototype.scan = async function (vars, site, res) {
  let obj = res, fn = null, script = null
  if (obj && typeof(obj.text) === 'function')
    obj = await obj.text()
  if (site.acceptJson) {
    if (typeof(obj) === 'string')
      obj = JSON.parse(obj, jsonDateParser)
    script = site.acceptJson
    fn = (path) => {
      let found = JSONPath({path, json: obj})
      return found && found[0]
    }

  } else if (site.acceptHtml) {
    if (typeof(obj) === 'string')
      obj = this.parseHtml(obj)
    script = site.acceptHtml
    fn = (path) => {
      let sel = obj, funk = null, attr = null, match = null
      if ((match = path.match(/^(.*):(\S+)$/)) !== null) {
        path = match[1].trim()
        funk = match[2]
      } else if ((match = path.match(/^(.*)@(\S+)$/)) !== null) {
        path = match[1].trim()
        attr = match[2]
      }

      if (path.length > 0)
        sel = this.searchHtml(obj, path)
      else
        sel = this.parseHtml(obj)

      if (sel) {
        if (funk)
          return sel.map(x => x[funk]()).toArray().join()
        if (attr)
          return sel.attr(attr)

        return this.htmlToArray(sel)
      }
    }

  } else if (site.acceptXml) {
    if (typeof(obj) === 'string')
      obj = this.parseXml(obj)
    script = site.acceptXml
    fn = (path) => this.searchXml(obj, path)
  }

  if (obj instanceof Array) {
    let out = []
    delete vars.out
    for (let i = 0; i < obj.length; i++) {
      let v = Object.assign({}, vars)
      this.scan(v, site, obj[i])
      out.push(v.out)
    }
    vars.out = out
  } else if (fn) {
		this.scanScript(vars, script, fn)
  }
	return vars
}

F.prototype.scrape = async function (tasks, req, res) {
  let site = this.options[req.id]
  return this.scan(tasks.vars, site, res)
}
