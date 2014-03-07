;(function(){

  var rpgvault = {};


  rpgvault.VERSION = "0.0.0";


  // Exports
  if (typeof module !== "undefined" && module.exports) {
    module.exports = rpgvault;
  }
  if (typeof define === "function" && typeof define.amd === "object" && define.amd) {
    define("rpgvault", function(){
      return rpgvault;
    });
  }
  if (typeof window !== "undefined") {
    window.rpgvault = rpgvault;
  }

}).call(this);
