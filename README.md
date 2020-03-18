# GRest

RESTful service wrapper with Promises and OOP.

## Usage

```js
/*
You can pass the authorization credentials on construction or later. If set, it's
automatically sent on the Authorization header on every request. Make sure it conforms
to the Authorization header schema:
https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
*/
let api = new GRest("https://api.net" /*, authorization */)

/*
Add endpoints/resource points. Every endpoint will be appended as a property of the object
so it can be called like: api.endpoint.method(....). Endpoint names with non-word (\W)
characters will be converted to a camelCase property.
*/
.endpoints(["auth/login", "users"]) 

/*
Add headers (optional). These will be sent on every request. If the Authorization header
is set with this, the api.authorization property will be ignored.
*/
.headers({ "Accept-version": "3.2" });

/*
Get the endpoints and headers
*/
let endpoints = api.endpoints(); //["auth/login", "users"]
let headers = api.headers(); //{ "Accept-version": "3.2" }

/*
Add endpoints and headers later
*/
api.endpoints(["support-tickets"]).headers({ "Another-Header": "123" });

/*
The entire API can be observed for activity on any of its endpoints. This can be useful
for displaying an "network busy" indicator on UI, for example.
*/
api.setObserver("observerId", msg => {
	//... requests being done, update ui or whatever ....
});

/*
Request some endpoint. On this example, this endpoint responds a valid JWT if the user
authenticates correctly. This will result on this request:
POST https://api.net/auth/login
*/
api.authLogin.post({ email, pass }).then( response => {
	//We have the JWT, set it so it's sent on every request from now on
	api.authorization = "Bearer " + response.data.newJwt; //Using Bearer schema
}).catch(error => {
	//Request failed
});

/*
Request other endpoints. This will result on this request:
GET https://api.net/users/?foo=bar
*/
api.users.get("?foo=bar").then(({data}) => ...);

//This results on the same request
api.users.get({ foo: "bar" }).then(({data}) => ...);

/*
Request a single user resource. Results on this request:
GET https://api.net/users/12345
*/
let uid = "12345";
api.users.get(uid).then(({data}) => ...);

/*
Set a more customizable request, eg, if you need to send headers, etc. Just pass an Axios's
config obj. Keep in mind the 'X-Requested-With' header will be ignored and
overwriten. The following will result on this request:
POST https://api.net/users/12345?foo=bar&abc=1
*/
api.users.http({
	method: 'post',
	url: 'https://another-api.net', //will be ignored
	headers:{
		"X-Requested-With": "Hello world", //will be ignored
		"One-Time-Header": "1", //will send this header only on this request
		"Accept-version": "4.0", //will overwrite the global header set above
		"Authorization": "abc" //will send this and not the JWT set above
	},
	data: { 
		name: "Greg" 
	},
	params:{
		foo: "bar",
		abc: 1 
	}
}, "12345").then(({data}) => ...).catch( error => ... );

/*
Session ends. From now on, no Authorization header will be sent automatically, unless you
manually set the Authorization header with api.headers(), in such case api.authorization is
completely ignored and you have to unset the header with:
api.headers({"Authorization": null})
*/
api.authorization = null;
```

## Dependencies

[axios](https://github.com/axios/axios)
[GObservable](https://cdn.jsdelivr.net/gh/grbolivar/jsutils/patterns/GObservable.min.js)

## Installing

### Via jsDelivr

```html
<!-- Dependencies -->
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/grbolivar/jsutils/patterns/GObservable.min.js"></script>
<!-- GRest -->
<script src="https://cdn.jsdelivr.net/gh/grbolivar/GRest/GRest.min.js"></script>
```