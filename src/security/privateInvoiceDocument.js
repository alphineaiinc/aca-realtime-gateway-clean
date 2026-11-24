const {PDFDocument,StandardFonts}=require('pdf-lib');
async function renderInvoiceCopy(row){
 const amount=String(row.amount_usd);
 if(!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(amount)||!['paid','unpaid'].includes(row.status))throw Error('Invalid ledger record');
 const date=new Date(row.generated_at).toISOString().slice(0,10);
 const pdf=await PDFDocument.create();
 const page=pdf.addPage([595,842]);const font=await pdf.embedFont(StandardFonts.Helvetica);
 const lines=['Alphine AI - Invoice ledger copy','Invoice: '+String(row.id),'Generated: '+date,'Amount (USD): '+amount,'Status: '+row.status.toUpperCase(),'Ledger copy - not original tax invoice'];
 lines.forEach((line,i)=>page.drawText(line,{x:50,y:780-i*30,size:14,font}));
 return Buffer.from(await pdf.save());
}
module.exports={renderInvoiceCopy};
