
const inteval = setInterval(() => {
  console.log(`Ping, it is now ${new Date().toISOString()}`);
}, 5000);
  
setTimeout(() => {
  clearInterval(inteval);
}, 20 * 1000);
