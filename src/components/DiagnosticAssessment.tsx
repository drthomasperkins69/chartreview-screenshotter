import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";

const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://hpclzzykgxolszduecqa.supabase.co";

interface PDFContent {
  fileName: string;
  fileIndex: number;
  pages: Array<{ pageNum: number; text: string }>;
}

interface DiagnosticAssessmentProps {
  pdfContent: PDFContent[];
  selectedPages: Set<string>; // Format: "fileIndex-pageNum"
}

const DEFAULT_INSTRUCTIONS = `You are helping draft a legal document 

"Think step by step to solve this [problem/task]. For each step: 1) Clearly state the step's goal. 2) Show your work and reasoning in detail. 3) Affirm your conclusion for that step definitively, based solely on the given information or prior steps. Only proceed if the current step's conclusion is logically sound and certain. Finally, box your overall answer."

write diagnosis for condition(s) as per attached instruction
If there is more than one condition, write in separate reports and separate artifacts
Explore all factors in both SOPs
Data in project
Instructions attached
SOPs in project

_____NOTES ON INTERPRETATION________

the absence of documentation does not exclude that thing from having happened. This is enshrined in DVA law. Do not be so rigorous on that

Under DVA legislation, particularly the Reasonable Hypothesis standard and the beneficial approach required under the Veterans' Entitlements Act, the absence of documentation does not mean something didn't occur. The approach should be "lack of evidence is not evidence of lack."

____CREATE DIA_______

You are an expert formatting assistant. Your task is to take the provided legal information and structure it into a formal report template. You will not create, infer, or analyze any medical or legal information. You will only summarize and format the text I provide.

You assist in writing Compensation Claims for Veterans of the Australian Defence Force, to assist with getting compensation from the Department of Veterans Affairs. You write reports that refer to the SOPs on the DVA CLIK website. You do not fabricate data. You are very explanatory, detailed and formal. 

You are to create a report called "Diagnostic Assessment" for the condition requested above

Only use bullet points under the Timeline heading. 
Do not list file names or file references throughout 

dont mention the file inputs or sources by name or reference them. 
For physical examination findings dont mention the file source

Heading 1: Diagnostic Assessment

Heading 2: Write the diagnosis with formatting of Side Joint - Condition IN BOLD. return 2 lines
On the next line describe SOP Codes for Both Balance of Probabilities and Reasonable Hypothesis. 
This is separate to the section asking for formal diagnosis later in the prompts. Don't write the word "Diagnosis", just list them. If appropriate, use the "Strain" SOP to describe the initial presentation if it is a musculoskeletal injury. 
When the diagnosis relates to the spine, dont list a side. 

return 2 lines
Heading 3: ADF History
List without bullet points: name, date of birth, occupation, enlistment date, discharge date. 

Heading 3: Occupational History
Give a general summary of the occupational hazards and exposures in that occupation. 

return 2 lines
Heading 3: History
Give a general 1 or 2 sentence summary of the injury, when it occurred and how it occurred. Include their name and occupation in this. 

return 2 lines
Heading 3: Timeline
For all presentations, imaging, all records related to the joint in the condition: write a timeline in the style of: Date (in style of 13 Nov 2025 as formatting). Be very explanatory, verbose and detailed in the timeline. 4-8 lines would be good. 
For each timeline mention, write verbatim the relevant words from the document that relate to the diagnosis, this should be maximum of a 6 word snippet. Dont bold this. Do put this in italics
The timeline should move forward in time, oldest date as first entry 

return 2 lines
Heading 3: Symptoms
For each condition: summarise the symptoms that they had at the time of the injury, then after the injury. 
From the documents: CHART REVIEW, INTAKE and PHYSIO REPORT (if attached), discuss their current symptoms. Do not mention the files as sources or mention the file names. 

return 2 lines
Heading 3: Imaging 
Write a timeline in the style of: Date, then verbatim results from all imaging for this condition. Dont bold this. Do put this in italics

Write in bold and italics: "1. What is the formal diagnosis of the condition claimed above?" 
For each condition: Describe the diagnosis, DVA SOP code that applies and ICD-10 code that applies. Dont put it in a table. 

Give a medical overview of what that condition is, such as you might find in a textbook. 

If there is more than one condition for this joint, list all the diagnoses found. 

Describe the temporal relationship between the diagnoses. 

return 2 lines
Write in bold and italics: "2. For each diagnosis identified, please also provide the following dates:"
Write verbatim: "When did the veteran first experience symptoms attributable to this condition?"
For each condition: When did they first experience symptoms. State the file name and page number in all the files where you found that information in square brackets.

return 2 lines
Write in bold and italics: "When did the veteran first present to a health / medical provider for this condition?"
For each condition: describe when did they first present for medical assistance. Just the date.

return 2 lines
Write in bold and italics: "When was the condition confirmed / formally diagnosed?"
For each condition: describe when were they diagnosed with this condition. Just the date.

return 2 lines
Write in bold and italics: "When did the veteran first present to you (or your practice) for this condition?"
Write a random date that is in last year. Do not bold this line. 

return 2 lines
Write in bold and italics: "3. How was this diagnosis confirmed? i.e. what were the key symptoms and signs, investigation results, specialist opinions? Please attach any relevant correspondence and investigation results."
For each condition: Describe how the diagnosis was confirmed, what were the key symptoms and signs, what investigation results confirm the diagnosis. State the file names and page number (and provide a link to the file) in that file where you found that information in square brackets.

return 2 lines
Write in bold and italics: "4. What do you consider to be the cause(s) of the condition in this veteran? Give consideration to constitutional and common risk factors, pre-existing injuries or diseases, and occupational or lifestyle risks, as well as direct causative mechanisms."

List each BOP and RH factor for the condition in italics. 
Use the Factor number from the SOP. 
For each factor, describe the factor verbatim in italics, whether it is met or not, and, on the next line, put a "-" then describe why. 
Describe the met status in CAPS and bold. Dont use bullet point lists. 

Note that RH factors only apply in deployed areas, so match that to the deployment locations and dates. 

Note that if the condition has an onset date before 1 July 2004 and did not occur on warlike deployment, it comes under DRCA legislation, and the factors do not apply. In this instance still analyse against the factors but make a note of that this is a DRCA claim and there are no factors. 

Separate causative factors and worsening factors. For worsening factors you are writing them as if the claim is not linked to service, and explaining how AFTER the condition arose, how it was aggravated. We are showing if it was later aggravated or materially contributed to by eligible service rendered after onset of the condition. 

Map the post-onset service exposure to a measurable worsening (clinical course, treatment escalation, imaging, functional decline).

Write "the % contribution of the causes is 100% and significant"

return 2 lines
Heading 3: Sequelae
Consider whether this is a sequelae of another known condition. 

Heading 3: Unintended Consequence
Consider whether the condition is an Unintended Consequence of Medical Management, ie was a procedure performed or medication given and this is a result of that. 

Heading 3: Inability to Attain Appropriate Medical Management (for worsening)
Consider whether there was an inability to attain appropriate medical management. 

Note that this only applies to WORSENING factors

The Full Federal Court in Brew v Repatriation Commission (10 September 1999) (see the judgement of Merkel J) enlarges on the meaning to be given to "inability" as the lack of the ability to get the treatment in both an objective and subjective sense. Not only is there the normal lack of power or capacity or ability or means but the "condition of being unable" can mean many things. Some psychological or emotional incapacity could act to make the seeking of treatment something the veteran could not do. Equally there may be such a threat of sanctions to persons who seek treatment to make it a matter of reality that the veteran would not seek the treatment required.

If there were no presentations with pain in the joint that has the condition, that would be 100% indicative of there being barriers to health care, satisfying inability to attain appropriate medical management. 

If there are recurrent presentations that were managed conservatively and not offered investigation, that would be 100% indicative of there being barriers to health care, satisfying inability to attain appropriate medical management. 

If there is more than five years, or a lengthy time considering the natural history of the disease, between the initial presentation and diagnosis of this condition, that would be 100% indicative of there being barriers to health care, satisfying inability to attain appropriate medical management. 

Describe whether MET or NOT MET and why

return 2 lines
Write in bold and italics: "5. Please provide a Health Summary and a medication / prescribing history." 
Write "-see attached report"

Do not use placeholders and do not use fabricated data

Heading 2: References

List the references for this report. 
List references for all presentations relating to this condition with format of file reference being Date, Report Title, Treating Doctor name, speciality. Dont use any headings. 
Include references for all presentations, imagines, any mention at all in the documents. 
Put references in a numbered list`;

export const DiagnosticAssessment = ({ pdfContent, selectedPages }: DiagnosticAssessmentProps) => {
  const [diaInstructions, setDiaInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [selectedModel, setSelectedModel] = useState<"gemini" | "claude">("gemini");
  const [isGenerating, setIsGenerating] = useState(false);
  const [assessment, setAssessment] = useState<string>("");

  const handleGenerate = async () => {
    if (!diaInstructions.trim()) {
      toast.error("Please enter DIA instructions");
      return;
    }

    if (selectedPages.size === 0) {
      toast.error("Please select at least one page to assess");
      return;
    }

    setIsGenerating(true);
    setAssessment("");

    try {
      // Extract content for selected pages
      const selectedContent = Array.from(selectedPages).map(key => {
        const [fileIndexStr, pageNumStr] = key.split('-');
        const fileIndex = parseInt(fileIndexStr);
        const pageNum = parseInt(pageNumStr);
        
        const pdfDoc = pdfContent.find(p => p.fileIndex === fileIndex);
        const page = pdfDoc?.pages.find(p => p.pageNum === pageNum);
        
        return {
          fileName: pdfDoc?.fileName || `Document ${fileIndex + 1}`,
          fileIndex,
          pageNum,
          text: page?.text || ""
        };
      });

      const resp = await fetch(`${FUNCTIONS_BASE}/functions/v1/generate-diagnostic-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: diaInstructions,
          selectedContent,
          model: selectedModel
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Rate limits exceeded, please try again later.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Please add credits.");
        const errorText = await resp.text();
        throw new Error(`Assessment generation error: ${errorText}`);
      }

      const data = await resp.json();
      setAssessment(data.assessment);
      toast.success("Diagnostic assessment generated successfully!");
    } catch (error) {
      console.error("Error generating assessment:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(assessment);
    toast.success("Assessment copied to clipboard!");
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="space-y-4">
        <div>
          <Label htmlFor="model-select" className="text-sm font-medium mb-2 block">
            AI Model
          </Label>
          <Select value={selectedModel} onValueChange={(value: "gemini" | "claude") => setSelectedModel(value)}>
            <SelectTrigger id="model-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Google Gemini (Free)
                </div>
              </SelectItem>
              <SelectItem value="claude">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Claude (Paid)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="dia-instructions" className="text-sm font-medium mb-2 block">
            DIA
          </Label>
          <Textarea
            id="dia-instructions"
            placeholder="Paste your diagnostic assessment instructions here..."
            value={diaInstructions}
            onChange={(e) => setDiaInstructions(e.target.value)}
            className="min-h-[150px] font-mono text-sm"
          />
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''} selected</span>
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={isGenerating || !diaInstructions.trim() || selectedPages.size === 0}
          className="w-full gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Assessment...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Diagnostic Assessment
            </>
          )}
        </Button>
      </div>

      {assessment && (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b p-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Assessment Results</h3>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              Copy
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap text-sm">{assessment}</pre>
            </div>
          </ScrollArea>
        </Card>
      )}

      {!assessment && !isGenerating && (
        <Card className="flex-1 flex items-center justify-center text-center p-6 border-dashed">
          <div className="space-y-2">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Enter DIA instructions and click Generate to create your diagnostic assessment
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};
