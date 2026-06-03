// src/lib/utils/invoicePrintStyles.ts
// ✅ Dedicated print styles for invoice printing
// Strategy: Use a unique ID (#invoice-print-area) and hide everything else
// This avoids fragile CSS selectors that break with Next.js DOM structure

export const PRINT_CONTAINER_ID = 'invoice-print-area'

export const invoicePrintCSS = `
  @media print {
    /* A4 page setup */
    @page {
      size: A4 portrait;
      margin: 12mm;
    }

    /* Reset body */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      background: white !important;
    }

    /* 
     * NUCLEAR HIDE: Hide absolutely everything in the document.
     * We use visibility:hidden + height:0 instead of display:none
     * because display:none on parent kills ALL children regardless
     * of their own display value. visibility + overflow lets us
     * surgically re-show the print area.
     */
    body * {
      visibility: hidden !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      border: none !important;
      line-height: 0 !important;
      font-size: 0 !important;
    }

    /* 
     * SHOW ONLY the print container and ALL its descendants.
     * #invoice-print-area is a unique ID so this always works
     * regardless of DOM nesting depth.
     */
    #${PRINT_CONTAINER_ID},
    #${PRINT_CONTAINER_ID} * {
      visibility: visible !important;
      height: auto !important;
      margin: revert !important;
      padding: revert !important;
      overflow: visible !important;
      line-height: normal !important;
      font-size: revert !important;
    }

    /* Position the print area as the only visible content */
    #${PRINT_CONTAINER_ID} {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      z-index: 999999 !important;
      background: white !important;
      padding: 0 !important;
    }

    /* Ensure clean print rendering */
    #${PRINT_CONTAINER_ID} * {
      box-shadow: none !important;
      text-shadow: none !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Prevent page breaks inside content blocks */
    #${PRINT_CONTAINER_ID} table,
    #${PRINT_CONTAINER_ID} tr,
    #${PRINT_CONTAINER_ID} .print-no-break {
      page-break-inside: avoid !important;
    }

    /* Elements explicitly marked no-print stay hidden */
    .no-print,
    .no-print * {
      display: none !important;
      visibility: hidden !important;
    }
  }
`