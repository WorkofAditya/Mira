function addRow(data){

const tbody = document.getElementById("dispatchBody")

const tr = document.createElement("tr")

tr.innerHTML = `
<td>${data.lr}</td>
<td>${data.consignor}</td>
<td>${data.consignee}</td>
<td>${data.parcel}</td>
<td>${data.kg}</td>
<td>${data.paid}</td>
<td>${data.topay}</td>
<td>DD</td>
`

tbody.appendChild(tr)

}

function setPrintTime(){
const now = new Date()
document.getElementById("printTime").textContent = now.toLocaleString()
}

setPrintTime()
