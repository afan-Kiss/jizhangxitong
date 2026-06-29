import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const exportDir = path.join(__dirname, '../apps/server/exports')
const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.xlsx')).sort().reverse()
const file = path.join(exportDir, files[0])
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const sheet = wb.getWorksheet('日常物料报销明细')
let attachmentRowsWithoutAmount = 0
let mainRowsWithAmount = 0
sheet.eachRow((row, rn) => {
  if (rn === 1) return
  const amount = row.getCell(6).value
  const seq = row.getCell(1).value
  if (amount !== null && amount !== undefined && amount !== '') {
    if (typeof amount === 'object' && amount.formula) return
    mainRowsWithAmount++
  } else if (seq === '' || seq === null) {
    attachmentRowsWithoutAmount++
  }
})
const images = sheet.getImages?.()?.length ?? 0
console.log(JSON.stringify({ file: files[0], mainRowsWithAmount, attachmentRowsWithoutAmount, embeddedImages: images }, null, 2))
