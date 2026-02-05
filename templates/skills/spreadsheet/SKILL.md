---
name: spreadsheet
description: Handle Excel/CSV files properly - survey first, read smart, take notes
args: file_path
---

# /spreadsheet - Smart Spreadsheet Handling

Don't dump data. Survey first, read smart, take notes.

---

## Step 1: Survey the File

```python
python3 -c "
import pandas as pd
xlsx = pd.ExcelFile('FILE_PATH')
print('SHEETS:', xlsx.sheet_names)
for sheet in xlsx.sheet_names:
    df = pd.read_excel(xlsx, sheet_name=sheet)
    print(f'{sheet}: {len(df)} rows, {len(df.columns)} cols')
"
```

**Note:**
- Which sheets look like summaries? (usually smaller, named "Summary", "Overview")
- Which are detail/working sheets? (larger, specific names)
- Which might be exports/raw data?

---

## Step 2: Understand User's Task

Before reading data, clarify:
- What question are they trying to answer?
- What time period matters?
- What level of detail? (summary vs line items)

This determines which sheets to read.

---

## Step 3: Read Key Sheets Properly

Excel headers are often NOT in row 0. Find the real header:

```python
python3 -c "
import pandas as pd
# Preview first 10 rows to find header
df = pd.read_excel('FILE_PATH', sheet_name='SHEET_NAME', header=None, nrows=10)
print(df.to_string())
"
```

Then read with correct header row:

```python
python3 -c "
import pandas as pd
df = pd.read_excel('FILE_PATH', sheet_name='SHEET_NAME', header=N)  # N = header row
print(df.head(20).to_string())
"
```

---

## Step 4: Take Notes

As you explore, write down:
- Key figures found
- Structure observations
- Questions for user
- Which sheets are relevant

Share these with user before diving deeper.

---

## Step 5: Answer the Question

Only NOW process the specific data needed:
- Filter to relevant rows/columns
- Calculate what user asked for
- Present clearly with context

---

## Tips

**Finding totals:** Look for rows with "Total", "Subtotal", "Net", "Gross"

**Date columns:** Often monthly (May-25, Jun-25) or yearly (FY25, FY26)

**Multiple locations:** Watch for sheets per location (Akl, Chch, HO)

**Budget vs Actual:** Look for columns labeled "Budget", "Actual", "Forecast", "Variance"

---

## Example Flow

User: "What's the marketing budget for FY27?"

1. Survey → find sheets with "Marketing" or "Budget"
2. Read Marketing sheet header properly
3. Find FY27 column or total row
4. Report: "FY27 Marketing budget is $X, broken down as..."

---

## Don't

- Dump entire sheets
- Assume row 0 is header
- Read all sheets when you need one
- Give numbers without context
