window.addEventListener('focus', ()=>{loadActualUrl()});
    
function loadActualUrl()
{
    window.location.href = window.location.href.split("#")[1];
}