/**
GRest 3.0.0
RESTful service wrapper with Promises and OOP.

DEPENDENCIES:
axios
GObservable
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

		//normalize url so it ends with /
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

		//Get method
		if (!list) return endpoints;

		//concat and remove dupes
		this._endpoints = Array.from(new Set(endpoints.concat(list)));

		list.forEach(endpoint => {
			if (_this[endpoint]) return; //avoid dupes

			//Transform to camelCase
			camelCase = endpoint.toLowerCase().split(/\W/).map((e, i) =>
				i == 0 ? e : e.charAt(0).toUpperCase() + e.slice(1)
			).join("");

			_this[camelCase] = new GRestEndpoint(endpoint, this);
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

	/*
	release() {
		let _this = this;
		Object.keys(_this).forEach(k => {
			if (_this[k] instanceof GRestEndpoint) {
				_this[k].release();
			}
			delete _this[k];
		});
	}
	*/
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
			method = axiosCnf.method,

			api = this._api,

			auth = api.authorization,

			//Append API's global headers & overwrite them if provided here. DO NOT modify original! Make a copy
			headers = axiosCnf.headers = Object.assign({}, api.headers(), axiosCnf.headers || {})
			;

		//Notify observers
		this._notify(method, "pending");

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

		//console.log(axiosCnf);

		return axios(axiosCnf)
			//Normalize response object
			.then(response => (
				this._notify(method, "ok"),
				response
			))
			//Normalize error object
			.catch(err => {
				this._notify(method, "fail");

				//Can be NULL/undefined if network error
				let errorResponse = err.response;

				//Only "message" is guaranteed
				throw errorResponse ? {
					message: errorResponse.statusText || "Error",
					status: errorResponse.status,
					data: errorResponse.data
				} : {
						message: err.message || "Network Error"
					}
			})
	}

	_notify(method, status) {
		this._api.notify({
			endpoint: this.name,
			method,
			status
		});
	}

	/** 
	Performs a GET request
	@param {String|Object} queryString
	*/
	get(queryString) {
		return this._requestWithQuery("get", queryString);
	}

	/** 
	Performs a POST request
	@param {String|Object} queryStringOrData
	@param {Object} data
	*/
	post(queryStringOrData, data) {
		return this._requestWithQueryAndData("post", queryStringOrData, data)
	}

	/** 
	Performs a PUT request
	@param {String|Object} queryStringOrData
	@param {Object} data
	*/
	put(queryStringOrData, data) {
		return this._requestWithQueryAndData("put", queryStringOrData, data)
	}

	/** 
	Performs a DELETE request
	@param {String|Object} queryString To be sent as query string
	*/
	delete(queryString) {
		return this._requestWithQuery("delete", queryString);
	}

	//Private
	_requestWithQuery(method, queryString) {
		return this.http({ method }, queryString);
	}

	//Private
	_requestWithQueryAndData(method, queryStringOrData, data) {
		if (!data) {
			data = queryStringOrData;
			queryStringOrData = null;
		}
		return this.http({ method, data }, queryStringOrData);
	}
};
