
(function(){
  const customerIcon='<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  const supplierIcon='<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 6h18v12H3V6zm2 2v8h14V8H5zm2 2h6v2H7v-2zm9 0h2v4h-2v-4z"/></svg>';
  const oldRender=window.renderMoneyParties;
  window.renderMoneyParties=function(){const result=oldRender.apply(this,arguments);document.querySelectorAll('#moneyPartiesList .debt-user-badge').forEach(el=>{el.innerHTML=el.classList.contains('cust')?customerIcon:supplierIcon;});return result;};
  window.renderMoneyParties();
})();
