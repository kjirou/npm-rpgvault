describe("rpgvault module", function(){

  it("Module definition", function(){
    expect(rpgvault).to.be.a("object");
  });

  it("VERSION", function(){
    expect(rpgvault.VERSION).to.match(/^\d+\.\d+.\d+(?:\.\d+)?$/);
  });
});
