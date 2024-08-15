const dns = require("node:dns");

dns.lookup("example.org", (err, address, family) => {
  console.log(family);
  console.log(address);
  console.log("address: %j family: IPv%s", address, family);
});
// address: "93.184.216.34" family: IPv4
