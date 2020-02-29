/**
GRest 2.1.1
RESTful service wrapper. REST APIs made easy!

DEPENDENCIES:
axios
v1/GObservable
*/



/**
You can pass the authorization credentials on construction or later. If set, it's automatically sent on the Authorization header on every request. Make sure it conforms to the Authorization header schema:
https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization

The entire API can be observed for activity on any of its endpoints. See GRestRequest for observers message. This can be useful for displaying an "network busy" indicator on UI, for example.
*/
class GRest extends GObservable {

	constructor(url, authorization) {
		super();

		this._endpoints = [];
		this._headers = {};

		//normalize the url so it ends with /
		this.url = url.replace(/[\/]*$/, "/");
		this.authorization = authorization;
	}

	/*
	Pass a list of endpoints names, exactly as the API provides them. Every endpoint will be appended as a property of this object so it can be called: api.endpoint.method(....). Endpoint names with non-word (\W) characters will be converted to a camelCase property. E.g:
	The list = ["users", "support-tickets", "auth/login"]
	Will result on properties: users, supportTickets, authLogin
	And they can be used like:
	api.users.get(...)
	api.supportTickets.post(...)
	api.authLogin.delete(...)
	*/
	endpoints(list) {
		let
			_this = this,
			endpoints = this._endpoints,
			camelCase
			;

		if (!list) return endpoints;

		//concat and remove dupes
		this._endpoints = Array.from(new Set(endpoints.concat(list)));

		list.forEach(endpoint => {
			if (_this[endpoint]) return; //avoid dupes

			//Transform to camelCase
			camelCase = endpoint.toLowerCase().split(/\W/).map((e, i) =>
				i == 0 ? e : e.charAt(0).toUpperCase() + e.slice(1)
			).join("");

			_this[camelCase] = new GRestEndpoint(endpoint, _this);
		});

		return _this;
	}

	headers(map) {
		let headers = this._headers;

		//Get method
		if (!map) return headers;

		//Copy-replace
		Object.assign(this._headers, map);

		//remove NULL or undefined headers
		Object.entries(headers).forEach(([key, value]) =>
			typeof value == 'undefined' || value == null ?
				delete this._headers[key] : 1
		)

		return this;
	}

	release() {
		let _this = this;
		Object.keys(_this).forEach(k => {
			if (_this[k] instanceof GRestEndpoint) {
				_this[k].release();
			}
			delete _this[k];
		});
	}
};




class GRestEndpoint {

	/** 
	@param {String} name Name of the endpoint as provided by the API
	@param {GRest} api  
	*/
	constructor(name, api) {
		this.name = name;
		this._api = api;
		this._url = api.url + name + "/";
	}

	/** 
	Allows for a more customizable request
	@param {Object} axiosCnf Just an Axios's config obj 
	@param {String|Object} queryString
	*/
	http(axiosCnf, queryString) {
		let
			api = this._api,

			auth = api.authorization,

			//Append API's global headers & overwrite them if provided here. DO NOT modify original! Make a copy
			headers = axiosCnf.headers = Object.assign({}, api.headers(), axiosCnf.headers || {})
			;

		//Auto-set request type
		headers['X-Requested-With'] = 'XMLHttpRequest';

		//Auto-set Authorization header
		if (auth && !headers.Authorization) {
			headers.Authorization = auth;
		}

		//URL
		axiosCnf.url = this._url;

		//Process queryString which can be String or Object
		let qsType = typeof queryString;

		//If obj, let axios deal with it
		if (qsType == "object") {
			axiosCnf.params = queryString;
		}
		//If anything else, just appended to the url
		else if (qsType != "undefined") {
			axiosCnf.url += queryString;
		}

		//This is needed for observing purposes, see GRestRequest
		axiosCnf.endpoint = this.name;

		//console.log(axiosCnf);

		return new GRestRequest(axiosCnf, this.api);
	}

	/** 
	Performs a GET request
	@param {String|Object} queryString
	*/
	get(queryString) {
		return this._getDel("get", queryString);
	}

	/** 
	Performs a POST request
	@param {String|Object} queryStringOrData
	@param {Object} data
	*/
	post(queryStringOrData, data) {
		return this._postPut("post", queryStringOrData, data)
	}

	/** 
	Performs a PUT request
	@param {String|Object} queryStringOrData
	@param {Object} data
	*/
	put(queryStringOrData, data) {
		return this._postPut("put", queryStringOrData, data)
	}

	/** 
	Performs a DELETE request
	@param {String|Object} queryString To be sent as query string
	*/
	delete(queryString) {
		return this._getDel("delete", queryString);
	}

	//Private
	_getDel(method, queryString) {
		return this.http({ method }, queryString);
	}

	//Private
	_postPut(method, queryStringOrData, data) {
		if (!data) {
			data = queryStringOrData;
			queryStringOrData = null;
		}
		return this.http({ method, data }, queryStringOrData);
	}

	release() {
		delete this.name;
		delete this._api;
	}
};



/**
Just a wrapper to AXIOS that adds two useful chainable methods:

ok(fn(data, response))
fn() invoked when the requests completes successfully.
	data: holds the response data as Axios delivers it (eg. JSON)
	response: normalized object with response metadata:
		status: http status
		headers: response headers

fail(fn(error))
fn() invoked if the request failed.
	error: normalized object with error info:
		status: http status
		code: error code
		msg: error message

Usage:
new GRestRequest({ axiosConfig }).ok(data => ...).fail(error => ...)

ok() and fail() can be chained and they will be invoked in order when the request gets resolved:
request.ok(data => ...).ok(data => ...).ok(data => ...).fail(error => ...)

Also, an GObservable can be pased on construction, whose observers will be notified about the request's status. Pass a special "endpoint" attribute on axiosConfig to notify observers of the endpoint name being requested. Observers will receive this object:
{
	endpoint: name of endpoint beign requested (only if provided on axiosConfig.endpoint, otherwise will be NULL)
	method: HTTP method requested
	status: "pending"|"ok"|"fail"
}
*/
class GRestRequest {

	constructor(axiosConfig, observable) {
		this._axios = axiosConfig;
		this._observable = observable;
		this._obsMsg = {
			endpoint: axiosConfig.endpoint || null,
			method: axiosConfig.method
		};

		//Do the request immediately
		this.again();
	}

	/**
	Performs a new request using the axios config provided
	*/
	again() {
		this._notify("pending");

		this._res = undefined;
		this._err = undefined;

		this._onOk = [];
		this._onErr = [];

		axios(this._axios)
			.then(r => {

				//Normalize response
				let res = [r.data, {
					status: r.status,
					headers: r.headers
				}];
				this._res = res;

				//Avoid observers throwing exceptions and axios catching them
				try {
					this._onOk.forEach(f => f(res[0], res[1]));
				} catch (e) { console.log(e) }

				this._onOk = [];

				this._notify("ok");

			})
			.catch(e => {

				let
					//Normalize error
					err = {
						message: e.message || "Network Error"
					},
					response = e.response
					;

				//response can be undefined if network error
				if (response) {
					err.message = response.statusText || "Error";
					["data", "status", "headers"].forEach(
						key => err[key] = response[key]
					);
				}

				this._err = err;

				this._onErr.forEach(f => f(err));
				this._onErr = [];

				this._notify("fail");

			})
			;

		return this;
	}

	ok(fn) {
		let res = this._res;
		typeof res != "undefined" ? fn(res[0], res[1]) : this._onOk.push(fn);
		return this;
	}

	fail(fn) {
		let err = this._err;
		typeof err != "undefined" ? fn(err) : this._onErr.push(fn);
		return this;
	}

	_notify(status) {
		if (this._observable) {
			this._obsMsg.status = status;
			this._observable.notify(this._obsMsg);
		}
	}

};
