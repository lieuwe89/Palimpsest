# Future Upgrades & Research

This document outlines potential features and technical research for future enhancements to Palimpsest.

---

## PDF/A Export (Archival)

### Overview
PDF/A is an ISO-standardized version of PDF specialized for use in the archiving and long-term preservation of electronic documents.

### Benefits
- **Future-proofing**: Ensures documents remain readable for decades regardless of software changes.
- **Self-contained**: Guarantees all fonts, images, and color profiles are embedded.
- **Compliance**: Required by many legal, government, and academic institutions for submissions.

### Downsides
- **File Size**: Larger files due to mandatory embedding of ICC profiles and fonts.
- **Strict Restrictions**: Disallows JavaScript, audio/video, and encryption.
- **Transparency**: Some versions (PDF/A-1) do not support transparency.

### Technical Implementation Details

For a browser-side implementation using `pdf-lib`, the target should be **PDF/A-3b**.

#### 1. Requirements
- **XMP Metadata**: Must include a specific `<pdfaid>` namespace in the document metadata.
- **OutputIntent**: Must embed an ICC profile (e.g., sRGB).
- **Font Embedding**: All used fonts must be subset and embedded.

#### 2. Proposed Snippet (Conceptual)
```javascript
import { PDFDocument, PDFName } from 'pdf-lib';

async function makePdfA(pdfDoc) {
  // 1. Add XMP Metadata
  const xmpMetadata = `<?xpacket begin="..." id="W5M0MpCehiHzreSzNTczkc9d"?>
    <x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
          <pdfaid:part>3</pdfaid:part>
          <pdfaid:conformance>B</pdfaid:conformance>
        </rdf:Description>
      </rdf:RDF>
    </x:xmpmeta>
    <?xpacket end="w"?>`;
  
  const metadataStream = pdfDoc.context.stream(xmpMetadata);
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

  // 2. Add OutputIntent with ICC Profile
  // Note: iccProfileBytes should be a Uint8Array of a minimal sRGB profile (~500 bytes)
  const profileStream = pdfDoc.context.stream(iccProfileBytes, {
    Length: iccProfileBytes.length,
    N: 3,
  });
  const profileRef = pdfDoc.context.register(profileStream);

  const outputIntent = pdfDoc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFX',
    OutputConditionIdentifier: 'sRGB IEC61966-2.1',
    DestOutputProfile: profileRef,
  });
  const outputIntentRef = pdfDoc.context.register(outputIntent);
  pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntentRef]));
}
```

### Challenges
- **Source Integrity**: If an existing PDF is missing fonts, `pdf-lib` cannot easily synthesize them. A "Best Effort" flag should be shown to the user.
- **Validation**: Full compliance requires a validator like **veraPDF**, which is difficult to run in the browser.
