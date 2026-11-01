/**
 * publicGrowGuideArticles — copy and metadata for four public article guides.
 *
 * Pure data. One shared presenter (`src/pages/PublicGrowGuideArticle.tsx`) renders
 * each entry, and `staticPublicSeoDocuments` builds the SSR head and JSON-LD from
 * the same objects so the visible FAQ and the FAQPage node cannot drift apart.
 *
 * Content rules: no Celsius, no prices, no product ratings, and no numbers the
 * cited sources do not state. Each source below was opened and read on
 * 2026-10-29 before the claim that cites it was written.
 */

export interface PublicGrowGuideLink {
  readonly label: string;
  readonly to: string;
}

export interface PublicGrowGuideSection {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs: ReadonlyArray<string>;
  readonly bullets?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<PublicGrowGuideLink>;
}

export interface PublicGrowGuideFaq {
  readonly question: string;
  readonly answer: string;
}

export interface PublicGrowGuideSource {
  readonly label: string;
  readonly url: string;
}

export interface PublicGrowGuideArticle {
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly h1: string;
  readonly description: string;
  readonly breadcrumbName: string;
  readonly intro: string;
  readonly quickAnswer: string;
  readonly sections: ReadonlyArray<PublicGrowGuideSection>;
  readonly faq: ReadonlyArray<PublicGrowGuideFaq>;
  readonly sources: ReadonlyArray<PublicGrowGuideSource>;
  readonly keepReading: ReadonlyArray<PublicGrowGuideLink>;
  readonly ctaHref: string;
  readonly ctaNote: string;
  readonly datePublished: string;
}

export const PUBLIC_GROW_GUIDE_DATE = "2026-10-29" as const;

export const PUBLIC_GROW_GUIDE_LEGAL_LINE =
  "Educational content for home growers. Follow the laws where you live." as const;

function signupHref(slug: string): string {
  return `/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=${slug}`;
}

const SOURCE = {
  osuHempSexEd: {
    label: "Oregon State University Extension — Hemp sex-ed: A primer on pollination (EM 9279)",
    url: "https://extension.oregonstate.edu/catalog/em-9279-hemp-sex-ed",
  },
  monthony2021: {
    label:
      "Monthony et al., The Past, Present and Future of Cannabis sativa Tissue Culture, Plants (2021)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7835777/",
  },
  adamek2024: {
    label:
      "Adamek, Jones & Torkamaneh, Somatic Mutation Accumulations in Micropropagated Cannabis Are Proportional to the Number of Subcultures, Plants (2024)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11279941/",
  },
  das2024: {
    label:
      "Das, Kretzschmar & Mieog, Importance of Media Composition and Explant Type in Cannabis sativa Tissue Culture, Plants (2024)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11434680/",
  },
  ribeiro2024: {
    label:
      "Ribeiro et al., Aseptic manipulation of cultures outside the laminar flow hood, Australian Journal of Crop Science (2024)",
    url: "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1165587/1/Aseptic-manipulation-of-cultures-outside-the-laminar-flow-hood.pdf",
  },
} as const satisfies Record<string, PublicGrowGuideSource>;

const MALE_SLUG = "isolate-male-cannabis-plant";
const TC_SLUG = "cannabis-tissue-culture";
const SAB_SLUG = "still-air-box-vs-flow-hood";
const CLIMATE_SLUG = "steady-climate-multiple-grow-tents";

export const ISOLATE_MALE_GUIDE: PublicGrowGuideArticle = {
  slug: MALE_SLUG,
  path: `/guides/${MALE_SLUG}`,
  title: "How to Identify and Isolate a Male Cannabis Plant",
  h1: "How to Identify and Isolate a Male Cannabis Plant Before It Pollinates Your Tent",
  description:
    "Learn when male cannabis plants become visible, how to confirm one at the nodes, and how to remove or isolate it before pollen reaches your flowering plants.",
  breadcrumbName: "Isolate a Male Cannabis Plant",
  intro:
    "One male plant can seed a whole tent. The window to act is between the first visible male flowers and the moment those flowers open. Confirm what you are looking at, move fast, and write down what you saw so the next run is easier.",
  quickAnswer:
    "Male and female plants look the same until flowers form. Once flowering begins, check the nodes where branches meet the stem. Males form small, closed flower buds that open to release pollen on the air. Remove a confirmed male before its flowers open. If you want to keep it for breeding, move it to a separate space with its own air.",
  sections: [
    {
      id: "when-sex-shows",
      heading: "When you can tell males from females",
      paragraphs: [
        "Oregon State University Extension notes that vegetative male and female plants look the same before flowers form. The differences show once flowering begins. Checking earlier than that can mislead you.",
        "As males flower, they often grow slender, with longer gaps between nodes near the top. Treat shape as a hint, not proof. Confirm by looking at the flowers themselves.",
      ],
    },
    {
      id: "confirm-at-the-nodes",
      heading: "Confirm at the nodes, on more than one branch",
      paragraphs: [
        "Look where side branches meet the main stem. Male flowers start as small, rounded, closed buds, often in clusters. Female flowers show fine white hairs (pistils) coming out of a small, pointed bract.",
        "Check several nodes, on more than one branch, before you decide. One odd node is weak evidence. A photo of each node you checked makes the decision easier to review later.",
      ],
      bullets: [
        "Male flower: rounded, closed bud with no hairs. It opens to release pollen.",
        "Female flower: small bract with one or two white pistils.",
        "Not sure yet: wait a few days and check the same nodes again. Do not guess.",
      ],
    },
    {
      id: "remove-or-isolate",
      heading: "Remove or isolate it before the flowers open",
      paragraphs: [
        "Oregon State describes growers excluding males by removing them before pollen develops. When male flowers open, pollen can be carried away on the wind. After that, moving the plant can spread pollen rather than contain it.",
        "If you are not keeping the plant, take it out of the grow space carefully and don't shake it. If you are keeping it for breeding, give it a separate space with its own air. A second tent that pulls air from the same room is not separate if its exhaust feeds back into your flower tent.",
      ],
      links: [
        {
          label: "How to keep a steady climate across multiple grow tents",
          to: `/guides/${CLIMATE_SLUG}`,
        },
      ],
    },
    {
      id: "after-removal",
      heading: "After removal: clean up and keep scouting",
      paragraphs: [
        "Change or brush off clothing and wipe down tools that touched the male before you handle flowering plants. Then keep scouting. Oregon State notes that sexual expression can respond to environmental stress. Female plants can also produce male flowers, and many growers scout weekly for males and for those plants.",
        "Write down which plant it was, what you saw, and the date. If a female later shows male flowers, that record helps you look for a stress pattern instead of starting over.",
      ],
    },
  ],
  faq: [
    {
      question: "How early can I tell if a cannabis plant is male?",
      answer:
        "Not reliably before flowers form. Oregon State University Extension notes that vegetative male and female plants look the same until flowering begins. After that, check the nodes for closed male flower buds or female pistils.",
    },
    {
      question: "What does a male cannabis plant look like at the nodes?",
      answer:
        "Small, rounded, closed buds with no white hairs, often in clusters where branches meet the stem. Female flowers show one or two white pistils coming out of a small bract. Check several nodes before deciding.",
    },
    {
      question: "Can I keep a male plant in the same tent if I am careful?",
      answer:
        "Not once its flowers are about to open. Pollen can be carried on the air. A male kept for breeding needs a separate space with its own air, not just the far corner of the same tent.",
    },
    {
      question: "Can a female plant still produce pollen?",
      answer:
        "Yes. Oregon State notes that sexual expression can respond to environmental stress, and female plants can produce male flowers. Keep scouting after you remove a male, and log what you find.",
    },
  ],
  sources: [SOURCE.osuHempSexEd],
  keepReading: [
    { label: "Keep a steady climate across multiple grow tents", to: `/guides/${CLIMATE_SLUG}` },
    { label: "Cannabis plant care guide", to: "/guides/cannabis-plant-care" },
    { label: "Daily grow log checklist", to: "/guides/daily-grow-log-checklist" },
  ],
  ctaHref: signupHref(MALE_SLUG),
  ctaNote:
    "Free to start. Log each sex check with a photo on the plant's timeline, so a missed male shows up in the record.",
  datePublished: PUBLIC_GROW_GUIDE_DATE,
};

export const TISSUE_CULTURE_GUIDE: PublicGrowGuideArticle = {
  slug: TC_SLUG,
  path: `/guides/${TC_SLUG}`,
  title: "Cannabis Tissue Culture: Stages, Risks and What to Record",
  h1: "Cannabis Tissue Culture for Home Growers: Stages, Common Failures and What to Record",
  description:
    "What cannabis tissue culture is, the stages of micropropagation, why contamination and hyperhydricity are common failures, and what to record for each culture.",
  breadcrumbName: "Cannabis Tissue Culture",
  intro:
    "Tissue culture grows new plants from small pieces of a plant on a sterile medium. It can keep genetics in a small space and produce clean starting material. It also fails in ways cuttings don't. This guide covers the stages, the common failures, and what to record so you can tell them apart.",
  quickAnswer:
    "Cannabis tissue culture (micropropagation) grows plantlets from small explants on a sterile nutrient medium. It usually runs in stages: starting the culture, multiplying shoots, rooting, and moving plantlets back to normal growing conditions. Common failures are contamination, hyperhydricity (glassy, water-soaked shoots) and culture decline. Published cannabis protocols are often hard to reproduce, so expect to adjust for your own cultivars.",
  sections: [
    {
      id: "what-it-is",
      heading: "What tissue culture is, and what it is not",
      paragraphs: [
        "In tissue culture, a small piece of plant tissue (the explant) is surface-disinfected and placed on a sterile medium in a closed container. With the right medium and conditions, it grows shoots, which can be divided and later rooted.",
        "A 2021 review in Plants describes how tissue culture can produce propagules free of insects, pathogens and viruses. That depends on clean technique and testing. Putting a plant into culture does not clean it by itself.",
      ],
    },
    {
      id: "stages",
      heading: "The stages of micropropagation",
      paragraphs: [
        "The same review describes micropropagation as five stages, each of which needs its own optimization. It notes that many cannabis protocols skip the multiplication stage.",
      ],
      bullets: [
        "Preparation: choose and prepare a healthy donor plant.",
        "Initiation: disinfect the explant and start it on medium.",
        "Multiplication: divide shoots to make more cultures.",
        "Rooting: root the shoots, in or out of the container.",
        "Acclimatization: move plantlets gradually back to normal humidity and light.",
      ],
    },
    {
      id: "common-failures",
      heading: "Common failures and how to tell them apart",
      paragraphs: [
        "Contamination: fungal or bacterial growth on the medium or around the explant. The review notes that cannabis explants generally respond well to surface disinfection, but every extra cut adds contamination risk. Where you work matters. See the still air box and flow hood comparison.",
        "Hyperhydricity: glassy, swollen, water-soaked shoots. The 2021 review reports high rates of hyperhydricity, callusing and culture death in some cannabis protocols. A 2024 study in Plants made its multiplication media hormone-free, which avoided long-term vitrification (another name for hyperhydricity). It also found that results depended on the cultivar.",
        "Culture decline: cultures that slowly lose vigor over repeated subcultures. The review cites long-term decline in the multiplication stage.",
      ],
      links: [{ label: "Still air box vs flow hood", to: `/guides/${SAB_SLUG}` }],
    },
    {
      id: "subculture-count",
      heading: "Why subculture count matters for genetics",
      paragraphs: [
        "A 2024 study in Plants found that genetic changes built up over successive subcultures, even when the clones were the same age. If you keep a cultivar in culture for a long time, record the subculture count for each vessel. Treat a high-count line as one to compare against your original plant, not as an exact copy.",
      ],
    },
    {
      id: "what-to-record",
      heading: "What to record for each culture",
      paragraphs: [
        "Most tissue-culture problems are easier to solve when each vessel has a history. Record:",
      ],
      bullets: [
        "Donor plant and cultivar, and the date the explant was taken.",
        "Medium batch, and any change from your usual recipe.",
        "Where the transfer was done (still air box or flow hood) and what was cleaned.",
        "Subculture count.",
        "What you saw at each check: clean, contaminated, glassy, browning, rooted.",
      ],
    },
  ],
  faq: [
    {
      question: "What is cannabis tissue culture?",
      answer:
        "Growing new plantlets from small pieces of a cannabis plant on a sterile nutrient medium in closed containers. The shoots can be divided to make more cultures, then rooted and moved back to normal growing conditions.",
    },
    {
      question: "Does tissue culture remove pests and diseases?",
      answer:
        "It can be used to produce clean starting material, but only with clean technique and testing. Putting a plant into culture does not clean it by itself, and a contaminated explant can carry problems forward.",
    },
    {
      question: "Why do my tissue culture shoots look glassy?",
      answer:
        "That is usually hyperhydricity, a common failure in cannabis tissue culture. Research links it to medium composition, and results vary by cultivar. Record the medium batch and cultivar for each vessel so you can compare.",
    },
    {
      question: "Do I need a flow hood to start tissue culture?",
      answer:
        "No, many home growers start in a still air box. A flow hood gives a filtered-air workspace and suits higher volume. Either way, technique and cleaning matter. See the still air box vs flow hood comparison.",
    },
  ],
  sources: [SOURCE.monthony2021, SOURCE.das2024, SOURCE.adamek2024],
  keepReading: [
    { label: "Still air box vs flow hood", to: `/guides/${SAB_SLUG}` },
    { label: "Cannabis plant care guide", to: "/guides/cannabis-plant-care" },
    { label: "How to start a grow journal", to: "/guides/how-to-start-a-grow-journal" },
  ],
  ctaHref: signupHref(TC_SLUG),
  ctaNote:
    "Free to start. Keep donor plants, batches and outcomes in one record, next to your grow timeline.",
  datePublished: PUBLIC_GROW_GUIDE_DATE,
};

export const STILL_AIR_BOX_GUIDE: PublicGrowGuideArticle = {
  slug: SAB_SLUG,
  path: `/guides/${SAB_SLUG}`,
  title: "Still Air Box vs Flow Hood for Tissue Culture and Clean Work",
  h1: "Still Air Box vs Flow Hood: Which Clean Workspace Fits Your Tissue Culture Work?",
  description:
    "How a still air box and a laminar flow hood each reduce contamination, where each falls short, and how to choose based on how much clean work you do.",
  breadcrumbName: "Still Air Box vs Flow Hood",
  intro:
    "Tissue culture and other sterile work fail when airborne spores and bacteria land on open medium. A still air box and a flow hood both reduce that risk in different ways. Neither replaces careful technique.",
  quickAnswer:
    "A still air box is a closed, clear box with arm holes. It works by keeping the air still, so fewer particles move onto your work. A laminar flow hood blows filtered air across your work surface. A still air box is simpler and suits low volume. A flow hood suits more transfers and longer sessions. Both depend on cleaning and technique.",
  sections: [
    {
      id: "still-air-box",
      heading: "How a still air box works",
      paragraphs: [
        "A still air box is usually a clear plastic tote turned upside down, with two arm holes. You clean the inside, let the air settle, then work slowly inside it. It does not filter air. It reduces the movement that carries particles onto open containers.",
        "Its limits come from that design. Fast arm movements stir the air, space is tight, and long sessions are awkward. How much contamination a still air box prevents has not been well measured, so judge it by your own results.",
      ],
    },
    {
      id: "flow-hood",
      heading: "How a laminar flow hood works",
      paragraphs: [
        "A laminar flow hood pushes air through a high-efficiency filter and across the work surface, so clean air flows past your open containers. It gives you room to work and suits more transfers per session.",
        "A hood is only as good as its filter and how it is used. Filters need maintenance, and anything upstream of your work (your hands, an open bag) can still put contamination in the airflow. A 2024 study in the Australian Journal of Crop Science ran flow hoods as room air filters. With the medium also chemically sterilized, it found no fungal or bacterial contamination in that setup. That result came from a specific lab method, not a home setup.",
      ],
    },
    {
      id: "how-to-choose",
      heading: "How to choose",
      paragraphs: [
        "Choose by how much clean work you do and how your results look, not by what others use.",
      ],
      bullets: [
        "Low volume or just starting: a still air box is a reasonable place to learn technique.",
        "Frequent transfers or long sessions: a flow hood is easier to work in.",
        "Contamination rising in either one: check technique, cleaning and medium handling before buying equipment.",
      ],
    },
    {
      id: "record-results",
      heading: "Record results so you can compare",
      paragraphs: [
        "Log which workspace each transfer used, what you cleaned, and whether each vessel stayed clean. After a few rounds, you can compare contamination between your own still air box and flow hood work.",
      ],
      links: [{ label: "Cannabis tissue culture guide", to: `/guides/${TC_SLUG}` }],
    },
  ],
  faq: [
    {
      question: "Is a still air box as good as a flow hood?",
      answer:
        "They work differently. A still air box keeps air still. A flow hood blows filtered air across your work. How much a still air box prevents contamination has not been well measured, so compare by logging your own results.",
    },
    {
      question: "Can I do cannabis tissue culture in a still air box?",
      answer:
        "Many home growers start that way. Work slowly, clean thoroughly, and keep sessions short. Record which transfers were done in the box so you can see whether contamination is a problem.",
    },
    {
      question: "Does a flow hood make my work sterile?",
      answer:
        "No. It supplies filtered air, but technique still matters. Your hands, tools and anything placed upstream of your work can still introduce contamination, and the filter needs maintenance.",
    },
  ],
  sources: [SOURCE.ribeiro2024, SOURCE.monthony2021],
  keepReading: [
    { label: "Cannabis tissue culture guide", to: `/guides/${TC_SLUG}` },
    { label: "How to start a grow journal", to: "/guides/how-to-start-a-grow-journal" },
  ],
  ctaHref: signupHref(SAB_SLUG),
  ctaNote:
    "Free to start. Record which workspace each transfer used and how it turned out, so you can compare.",
  datePublished: PUBLIC_GROW_GUIDE_DATE,
};

export const STEADY_CLIMATE_GUIDE: PublicGrowGuideArticle = {
  slug: CLIMATE_SLUG,
  path: `/guides/${CLIMATE_SLUG}`,
  title: "How to Keep a Steady Climate Across Multiple Grow Tents",
  h1: "How to Keep a Steady Climate Across Multiple Grow Tents in One Room",
  description:
    "Why tents in the same room drift apart, how to measure each one honestly, and how to keep lights-on and lights-off swings from pushing tents out of range.",
  breadcrumbName: "Steady Climate Across Multiple Tents",
  intro:
    "Two tents in the same room rarely share the same climate. Different lights, plant mass, fans and exhaust push each one its own way, and they all pull from the same room air. Steady climate starts with measuring each tent on its own.",
  quickAnswer:
    "Give each tent its own temperature and humidity reading at canopy height, and log them separately. Check that your sensors agree before comparing tents. Then manage the shared room air: stagger lights-on times only if the room can handle the load, watch the lights-off humidity rise, and fix the tent that drifts, not all of them at once.",
  sections: [
    {
      id: "why-tents-drift",
      heading: "Why tents in one room drift apart",
      paragraphs: [
        "Each tent has its own heat sources and its own plant mass. Each tent also pulls in the same room air. When one tent's lights come on, the room warms. When lights go off, plants keep releasing moisture and the air cools, so relative humidity often rises.",
        "The result: one room reading can look fine while one tent sits outside the range for its stage.",
      ],
      links: [{ label: "VPD chart by growth stage", to: "/vpd-chart" }],
    },
    {
      id: "measure-each-tent",
      heading: "Measure each tent on its own",
      paragraphs: [
        "Put a sensor in each tent at canopy height, away from direct light and fans. Before you compare tents, put the sensors side by side for a while to see how far apart they read. A gap you never checked can look like a climate difference that isn't there.",
        "Label each reading with its tent and its source: live, manual, or CSV import. A reading with no tent label can't tell you which tent to fix.",
      ],
      links: [{ label: "Sensor truth in the grow room", to: "/guides/sensor-truth-grow-room" }],
    },
    {
      id: "manage-shared-air",
      heading: "Manage the shared room air",
      paragraphs: [
        "Whatever the room does reaches every tent's intake. Keep exhaust going out of the room or into a space it won't feed back from. A dehumidifier or heater placed for one tent changes the intake air for all of them.",
        "Staggered light schedules can spread the heat load, but they also mean one tent is in lights-off humidity while another is at peak heat. Only stagger if you can keep each tent in range on both sides of its schedule.",
      ],
      links: [{ label: "Grow room VPD tracker", to: "/guides/grow-room-vpd-tracker" }],
    },
    {
      id: "fix-one-thing",
      heading: "Fix the tent that drifts, one change at a time",
      paragraphs: [
        "When one tent drifts, change one thing in that tent, then watch it through a full lights-on and lights-off cycle before changing anything else. Changing the room and several tents at once makes it hard to tell what worked.",
        "A separate tent for a male plant you are keeping, or for clones, adds another climate to manage and needs its own air.",
      ],
      links: [{ label: "Identify and isolate a male cannabis plant", to: `/guides/${MALE_SLUG}` }],
    },
  ],
  faq: [
    {
      question: "Can I use one sensor for several grow tents?",
      answer:
        "Not if you want to know each tent's climate. Tents in the same room drift apart. Use a sensor in each tent at canopy height and log each reading with its tent.",
    },
    {
      question: "Why does humidity rise when the lights go off?",
      answer:
        "Plants keep releasing moisture and the air cools, and cooler air at the same moisture shows a higher relative humidity. Watch each tent through the lights-off period, not just at midday.",
    },
    {
      question: "Should I stagger lights-on times between tents?",
      answer:
        "It can spread the heat load in a shared room, but one tent will be in lights-off humidity while another is at peak heat. Only stagger if each tent can stay in range on both sides of its schedule.",
    },
    {
      question: "How do I know if my sensors agree?",
      answer:
        "Put them side by side in the same spot for a while and compare the readings. Note any steady gap before comparing tents, so a sensor difference isn't mistaken for a climate difference.",
    },
  ],
  sources: [],
  keepReading: [
    { label: "VPD chart by growth stage", to: "/vpd-chart" },
    { label: "Grow room VPD tracker", to: "/guides/grow-room-vpd-tracker" },
    { label: "Sensor truth in the grow room", to: "/guides/sensor-truth-grow-room" },
    { label: "Identify and isolate a male cannabis plant", to: `/guides/${MALE_SLUG}` },
  ],
  ctaHref: signupHref(CLIMATE_SLUG),
  ctaNote:
    "Free to start. Log each tent's readings with their source, so you can see which tent drifts and when.",
  datePublished: PUBLIC_GROW_GUIDE_DATE,
};

/** In `/guides` card order. */
export const PUBLIC_GROW_GUIDE_ARTICLES: ReadonlyArray<PublicGrowGuideArticle> = [
  ISOLATE_MALE_GUIDE,
  TISSUE_CULTURE_GUIDE,
  STILL_AIR_BOX_GUIDE,
  STEADY_CLIMATE_GUIDE,
];
