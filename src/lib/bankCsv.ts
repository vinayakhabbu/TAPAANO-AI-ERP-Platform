// RFC 4180 quoting, fixed schema, exact decimals and ISO dates; never guess a bank's format.
export function parseBankCsv(input:string) {
  if(input.length>2_000_000)throw new Error('Statement file exceeds 2 MB.');
  const text=input.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field||closed)throw new Error('Invalid CSV quote.');quoted=true;}
    else if(c===','||c==='\n'||c==='\r') {row.push(field);field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];}}
    else{if(closed)throw new Error('Unexpected text after a quoted field.');field+=c;}
  }
  if(quoted)throw new Error('Unclosed CSV quote.');if(field||row.length||closed){row.push(field);rows.push(row);}
  if(rows.shift()?.join(',')!=='external_id,booked_on,description,reference,amount')throw new Error('Use columns external_id,booked_on,description,reference,amount in that order.');
  if(rows.length>5000)throw new Error('A statement supports at most 5000 rows.');
  const seen=new Set<string>();
  return rows.map((r,i)=>{
    if(r.length!==5)throw new Error(`Row ${i+2}: expected five columns.`);
    const [external_id,booked_on,description,reference,amount]=r;
    if(!external_id||external_id.length>150||seen.has(external_id))throw new Error(`Row ${i+2}: missing or duplicate transaction identifier.`);seen.add(external_id);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(booked_on)||!Number.isFinite(Date.parse(booked_on))||new Date(booked_on+'T00:00:00Z').toISOString().slice(0,10)!==booked_on)throw new Error(`Row ${i+2}: invalid ISO date.`);
    if(!/^-?\d{1,13}(\.\d{1,2})?$/.test(amount)||BigInt(amount.replace('.','').replace('-',''))===0n)throw new Error(`Row ${i+2}: enter a nonzero decimal amount with at most two places.`);
    if(description.length>500||reference.length>200)throw new Error(`Row ${i+2}: description or reference is too long.`);
    return {external_id,booked_on,description,reference,amount};
  });
}
