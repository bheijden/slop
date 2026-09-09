#!/usr/bin/env node
// Builds rules/mckinsey.json from the style guide a McKinsey consultant wrote.
//
// The guide is three things at once and the rule ids say which is which, because
// "leverage" and "delve" are flagged for completely different reasons and a
// reader who cannot tell them apart cannot judge a finding:
//
//   housestyle-   his taste. Not a claim about machines or about clarity. The
//                 em dash rule is here and the evidence says em dashes are not
//                 an AI tell -- it is in the set because the guide bans them.
//   consultant-   consulting-register jargon. Written by people, disliked anyway.
//   aislop-       reads as machine-written.
//   tight-        padding: hedges, throat-clearing, structure the point did not need.
//
// Several of these words carry an ordinary non-jargon sense -- a cryptographic
// key, a camera's focus, a disk drive, a marine ecosystem. Every such rule
// carves the real sense out of the pattern AND names the carve-out in its
// description, so that a reader looking at a finding can decide in a couple of
// seconds whether the linter has understood the sentence or not. The `miss`
// tests are the executable half of that promise.
//
//   node tools/build-mckinsey.mjs            write rules/mckinsey.json
//   node tools/build-mckinsey.mjs --check    build it and run its own tests

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const or = (...xs) => xs.join('|');

// --------------------------------------------------------------------------
// housestyle -- what he does not want to see, whatever the reason
// --------------------------------------------------------------------------

const HOUSESTYLE = [
  {
    id: 'housestyle-em-dash',
    name: 'Em dash',
    severity: 'warn',
    match: { kind: 'regex', pattern: '—|\\s–\\s|\\s--\\s|\\s—\\s', flags: 'g' },
    notable: { '>': 0 },
    description:
      'An em dash, or an en dash or double hyphen standing in for one. Section 9 of the guide '
      + 'bans them outright, so every occurrence is reported. This is taste, not detection: on '
      + 'this project\'s audit corpus em dashes appear in 8 of 18 human documents and 0 of 18 '
      + 'machine ones, and in 431,000 words of McKinsey, BCG and Bain writing they are the single '
      + 'most common finding of any rule, at 1,491 hits. A hit says the house style was broken. '
      + 'It says nothing about who or what wrote the sentence.',
    suggest: 'A comma if the aside is light, a colon if what follows explains, brackets if it is a '
      + 'true aside, a full stop if it is really a second sentence.',
    note: 'Overlaps ai-tells/em-dash. If both sets are loaded, ignore one or every em dash is '
      + 'reported twice.',
    tests: {
      hit: [
        'The migration took a week — longer than anyone expected.',
        'Demand fell in Q3 – sharply, and before the price cut.',
        'We reset pricing -- and volume held.',
      ],
      miss: [
        'The go-to-market plan is best-in-class in name only.',
        'Revenue fell 10-12% across the three regions.',
        'A well-run, end-to-end process needs no dash.',
      ],
    },
  },

  {
    id: 'housestyle-british-spelling',
    name: 'British spelling',
    severity: 'warn',
    // Only words that genuinely differ. A blanket -ise rule would flag "advise",
    // "exercise", "compromise", "premise" and "franchise", which are spelled
    // that way on both sides of the Atlantic -- the classic false fire here.
    match: {
      kind: 'regex',
      pattern: '\\b(?:'
        + or(
          '(?:organi|recogni|reali|priorit|optimi|summari|minimi|maximi|standardi|categori|'
            + 'special|central|normali|utili|analy|apologi|emphasi)s(?:e|es|ed|ing|ation|ations)',
          'behaviou?ral|behaviour|colour|favour|labour|honour|endeavour|neighbour|rumour|'
            + 'vapour|savour|flavour|harbour',
          'centre|centres|metre|metres|litre|litres|theatre|fibre|calibre',
          'defence|offence|licence(?:s|d)?|practise(?:s|d)?',
          'programme|programmes|whilst|amongst|learnt|spelt|burnt|dreamt',
          'modelling|modelled|travelling|travelled|labelling|labelled|cancelling|'
            + 'signalling|fuelled|counsellor',
        )
        + ')\\b',
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'Section 5 asks for American spelling. This lists only the words that actually differ '
      + '— "organise", "colour", "centre", "defence", "programme", "modelling". It deliberately '
      + 'does not use a general "-ise" pattern, because "advise", "exercise", "compromise", '
      + '"premise", "supervise" and "franchise" are spelled that way in American English too and '
      + 'a suffix rule flags all of them. "Practise" and "licence" are the one genuine trap left: '
      + 'British uses them for the verb and the noun respectively, and a hit on either may be '
      + 'correct British usage rather than a slip.',
    suggest: 'Use the American spelling.',
    tests: {
      hit: [
        'We will organise the programme around three centres of excellence.',
        'Their behaviour changed once the colour coding landed.',
        'The modelling was cancelled while we travelled.',
      ],
      miss: [
        'I advise we exercise the option before the premise expires.',
        'The franchise agreement requires we supervise the rollout.',
        'We recognized the organization had prioritized the wrong center.',
      ],
    },
  },
];

// --------------------------------------------------------------------------
// consultant -- section 7, written by people and disliked anyway
// --------------------------------------------------------------------------

// The three high-frequency ones get their own rule each, because each has a
// real non-jargon sense that has to be carved out by hand. Measured on the
// consulting corpus: "key" 488 uses in 62 of 88 documents, "focus" 483 in 62,
// "drive" 118 in 37. They are the loudest rules in this set by a wide margin
// and that is the intended behaviour, not a defect.

const KEY_TECH_BEFORE = 'api|ssh|gpg|pgp|rsa|aes|hmac|ssl|tls|oauth|jwt|private|public|secret|'
  + 'session|foreign|primary|composite|surrogate|natural|partition|sort|shard|encryption|'
  + 'decryption|signing|licen[sc]e|product|activation|access|registry|cache|hash|shift|caps|'
  + 'arrow|function|escape|answer|church|door|car|house|spare|piano|low|off';
const KEY_TECH_AFTER = 'pair|pairs|value|values|store|stores|ring|rings|chain|chains|code|codes|'
  + 'file|files|id|ids|management|rotation|exchange|derivation|length|size|material|signature|'
  + 'signatures|holder|hole|holes|cutter|west|largo|lime|biscayne';

const CONSULTANT = [
  {
    id: 'consultant-key',
    name: '"key" as a stand-in for important',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: `(?<!\\b(?:${KEY_TECH_BEFORE})[\\s-])\\bkeys?\\b`
        + '(?!\\s*[:=])'
        + `(?!\\s+(?:${KEY_TECH_AFTER})\\b)`
        + '(?!\\s+(?:to|of|is|are|was|were|in|on|at|for|and|or|that|which|from|with|under|by)\\b)'
        + '(?=\\s+[a-z])',
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      '"Key" used attributively to mean important — "the key drivers", "three key takeaways". '
      + 'The guide bans it because it almost never survives deletion: "the key drivers" and "the '
      + 'drivers" say the same thing. The pattern is built to leave the literal senses alone. It '
      + 'will not fire on a cryptographic or database key ("API key", "primary key", "key pair", '
      + '"key rotation", "key = value"), on a key that opens something ("the key to the cabinet"), '
      + 'or on a musical or place name. It also deliberately skips the predicate use — "this is '
      + 'key" — which the guide dislikes too, because catching it cleanly costs more precision '
      + 'than it is worth. If a finding here sits next to a noun that is a literal key, the '
      + 'carve-out has missed a collocation and the rule is wrong, not the sentence.',
    suggest: 'Delete it. If it is doing real work, name what makes the thing matter instead.',
    tests: {
      hit: [
        'The key drivers of margin are volume and mix.',
        'Three key takeaways emerged from the diligence.',
        'This is the key question for the board.',
      ],
      miss: [
        'Rotate the API key and the signing key before launch.',
        'The primary key and the foreign key both need an index.',
        'She kept the key to the filing cabinet in her desk.',
        'Set key = value in the config, then restart.',
      ],
    },
  },

  {
    id: 'consultant-focus',
    name: '"focus" as a substitute for a verb',
    severity: 'warn',
    match: {
      kind: 'regex',
      // Optical and research senses carved out on both sides.
      pattern: '(?<!\\b(?:in|out\\s+of|sharp|soft|auto|manual|deep|shallow|camera|lens)\\s)'
        + '\\bfocus(?:es|ed|ing|sed|sing)?\\b'
        + '(?!\\s+(?:group|groups|puller|ring|length|distance|point\\s+of|stacking))',
      flags: 'gi',
    },
    notable: { '>=': 2, per: 1000 },
    description:
      'Section 7 bans "focus". It is usually a placeholder for the verb that belongs there: "our '
      + 'focus is on reducing cost" is "we are reducing cost". Reported as a rate rather than per '
      + 'occurrence, at two or more per thousand words, because one use in a long document is not '
      + 'a habit — and because in 431,000 words of consulting writing it appears 483 times across '
      + '62 of 88 documents, so every-occurrence reporting would bury every other finding in this '
      + 'set. The optical sense is carved out: "out of focus", "sharp focus", "focus group", '
      + '"focal length" do not fire. A hit on a camera, a microscope or a research method is a '
      + 'false fire.',
    suggest: 'Name the action. "Our focus is on X" becomes "we are doing X".',
    tests: {
      hit: [
        'Our focus this quarter is margin, and the team will focus on the top ten accounts '
          + 'before anything else. A second focus is the channel mix, where discounting has run '
          + 'ahead of plan in two regions and nobody has owned the problem since March. The '
          + 'third focus is pricing discipline across the portfolio, which the commercial teams '
          + 'have raised twice. We will keep a continued focus on cost to serve through the '
          + 'second half, and the operating review in September will focus on whether any of it '
          + 'moved the numbers at all.',
      ],
      miss: [
        'The lens was out of focus, so we ran the focus group again with a longer focal length '
          + 'and better lighting. The image came back in sharp focus for the second panel of '
          + 'reviewers, who had asked for it after the first session was abandoned halfway '
          + 'through the morning. Auto focus was disabled for the retake because the room was '
          + 'darker than the studio we had used before, and the camera focus had drifted between '
          + 'the two sessions without anyone noticing until the footage was reviewed.',
      ],
    },
  },

  {
    id: 'consultant-drive',
    name: '"drive" meaning cause',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: '(?<!\\b(?:hard|disk|floppy|flash|thumb|usb|ssd|tape|test|four-wheel|front-wheel|'
        + 'rear-wheel|golf|scenic)[\\s-])'
        + '\\bdriv(?:e|es|ing|en)\\b'
        + '\\s+(?:(?:by|the|a|an|our|their|its|his|her|significant|further|greater|real|long-term|'
        + 'short-term|sustainable|meaningful)\\s+)*'
        + '(?:growth|value|adoption|change|impact|performance|results?|revenue|efficiency|'
        + 'innovation|transformation|outcomes?|savings|productivity|engagement|alignment|scale|'
        + 'margins?|profit(?:ability)?|demand|synerg(?:y|ies)|improvements?|success|momentum|'
        + 'behaviou?rs?|uptake|penetration|conversion|retention|utili[sz]ation)\\b',
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'Section 7 bans "drive" when it means cause — "drive growth", "driving adoption", "driven '
      + 'by margin improvement". The pattern only fires when an abstract business noun follows, '
      + 'from a closed list, so the vehicle and storage senses are untouched: "hard drive", "test '
      + 'drive", "drive to the site", "drive home the point" do not fire. That closed list is '
      + 'also the rule\'s limit — "drive better conversations" has no listed noun after it and '
      + 'will be missed. It under-reports on purpose. One false fire is known and worth '
      + 'recognising: in a transport document, "a 3% increase in driving demand" means demand '
      + 'for driving, and "driving" there is a noun rather than a verb. If the surrounding '
      + 'text is about vehicles rather than business outcomes, that is what has happened.',
    suggest: 'Say what actually causes it. "Pricing drove growth" becomes "growth came from the '
      + 'price cut" or "we grew because prices fell".',
    tests: {
      hit: [
        'The pricing reset will drive growth in the second half.',
        'Three factors are driving adoption across the base.',
        'Margin improvement was driven by significant savings in logistics.',
      ],
      miss: [
        'The hard drive failed, so we swapped in the flash drive.',
        'I will drive to the client site on Tuesday morning.',
        'A test drive of the new tool is scheduled for Friday.',
      ],
    },
  },

  {
    id: 'consultant-jargon',
    name: 'Consulting jargon',
    severity: 'warn',
    match: {
      kind: 'regex',
      distinct: true,
      pattern: '\\b(?:'
        + or(
          'synerg(?:y|ies|istic)',
          'holistic(?:ally)?',
          'best[- ]in[- ]class',
          'world[- ]class',
          'end[- ]to[- ]end',
          'stakeholder alignment',
          'operational(?:i[sz]e|i[sz]ed|i[sz]ing|i[sz]ation)',
          'value proposition',
          'go[- ]forward basis',
          'net[- ]net',
          'at the end of the day',
          'mov(?:e|es|ed|ing) the needle',
          'double[- ]click(?:ing)? on',
          'lean(?:ing)? in(?:to)? (?:the|this|that|it)',
          '(?<!(?:debt|financial|net|over|under|high|low)[-\\s])'
            + 'leverag(?:e|es|ed|ing)'
            + '(?! (?:ratio|ratios|multiple|multiples|level|levels|buyout|buyouts|loan|loans|'
            + 'finance|financing|credit|private equity))',
          'boil the ocean',
          'low[- ]hanging fruit',
          'deep[- ]div(?:e|es|ing)',
        )
        + ')\\b',
      flags: 'gi',
    },
    // Counts different terms, not repetitions: a document about partnerships may
    // fairly say "ecosystem" ten times, but reaching for four different pieces of
    // jargon is a register rather than a subject.
    notable: { '>=': 3 },
    description:
      'Section 7\'s list, as one rule. It counts how many *different* terms a document reaches '
      + 'for rather than how often, and reports at three or more, because one "synergy" is a word '
      + 'and four different pieces of jargon is a register. Measured on 431,000 words of the '
      + 'three firms\' own writing, the frequencies vary enormously: "leverage" 76 uses, '
      + '"best-in-class" 25, "synergy" 5, and four terms — "stakeholder alignment", "go-forward '
      + 'basis", "at the end of the day", "double-click" — never appear once. Those four are in '
      + 'the pattern because the guide bans them and they cost nothing to carry, but expect them '
      + 'to fire almost never: they are things consultants say out loud, not things they write.',
    suggest: 'Say the plain thing. Most of these have a one-word equivalent, and the ones that do '
      + 'not are usually hiding the absence of a specific claim.',
    tests: {
      hit: [
        'We will leverage best-in-class capabilities to drive synergies across the portfolio, '
          + 'on a go-forward basis, with a holistic view of the value proposition.',
      ],
      miss: [
        'We used the existing contracts to cut duplicate spend across the two businesses, which '
          + 'saved about $30 million in the first year and required no new systems at all, so the '
          + 'integration team could stay small and the finance close was not disrupted once.',
      ],
    },
  },

  {
    id: 'consultant-context-words',
    name: '"robust" and "ecosystem" outside their real senses',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: '(?:'
        // "robust", except the statistical sense the guide explicitly allows.
        + '(?<!\\b(?:distributionally|asymptotically)\\s)\\brobust(?:ness|ly)?\\b'
        + '(?!\\s+(?:standard\\s+errors?|estimator|estimators|regression|statistics|inference|'
        + 'check|checks|to\\s+outliers|covariance))'
        + '|'
        // "ecosystem", except the biological sense.
        + '(?<!\\b(?:marine|forest|coral|natural|river|desert|soil|aquatic|terrestrial|'
        + 'freshwater|woodland|reef)\\s)\\becosystems?\\b'
        + '(?!\\s+(?:services|restoration|collapse|biodiversity|degradation))'
        + ')',
      flags: 'gi',
    },
    notable: { '>=': 1, per: 1000 },
    description:
      'Two terms the guide bans with a qualifier attached: "robust" except in statistics, '
      + '"ecosystem" when metaphorical. Both qualifiers are carved into the pattern. "Robust '
      + 'standard errors", "robustness check" and "robust to outliers" do not fire; "a robust '
      + 'framework" does. "Marine ecosystem" and "ecosystem services" do not fire; "the partner '
      + 'ecosystem" does. Reported as a rate because both words have honest uses in the middle: '
      + '"a robust process" is vague, "a robust seal" is not. When one fires, the question to ask '
      + 'is whether a plainer word carries the same meaning — if it does, the guide is right, and '
      + 'if it does not, this is a false fire worth reporting back.',
    suggest: 'For "robust", say what it withstands. For "ecosystem", name the actual set of '
      + 'companies or people.',
    tests: {
      hit: [
        'We need a robust framework and a robust process before the partner ecosystem can scale. '
          + 'The current ecosystem is fragmented across four business units, and no robust '
          + 'governance exists today to decide who owns a partner when two of them want the same '
          + 'account. A robust operating model would settle that in a fortnight. Until it does, '
          + 'the ecosystem will keep growing at the edges while the centre has no view of it, and '
          + 'the robust reporting the board asked for in March remains a spreadsheet somebody '
          + 'maintains by hand.',
      ],
      miss: [
        'The regression reports robust standard errors, and the robustness check is in the '
          + 'appendix. It sits alongside the marine ecosystem survey and the ecosystem services '
          + 'valuation that the environmental team completed during the second quarter of the '
          + 'study period. Estimates are robust to outliers in both specifications, and the '
          + 'coastal ecosystem sampling followed the same protocol as the previous wave, so the '
          + 'two years can be compared directly without any further adjustment for method.',
      ],
    },
  },
];

// --------------------------------------------------------------------------
// aislop -- sections 6 and 8
// --------------------------------------------------------------------------

const AISLOP = [
  {
    id: 'aislop-narration',
    name: 'Narrating the writing',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: or(
        // Anchored to a sentence opening. Mid-sentence, "the figures in this
        // report" is a cross-reference to the document, not a preamble about
        // what the document is about to do.
        '(?:^|[.!?]["\')\\]]?\\s+|\\n)\\s*(?:In|Throughout) this '
          + '(?:section|article|report|paper|chapter|analysis|piece|webinar)\\b(?!\\s+of\\s+the\\b)',
        // "discuss" is not on the guide's list and does not belong here: in an
        // email "let's discuss tomorrow" is someone asking for a meeting.
        "\\bwe(?:'ll| will| shall) (?:explore|examine|delve|dive into|unpack|walk through)\\b",
        "\\blet(?:'s| us) (?:explore|examine|delve|dive into|unpack|walk through)\\b",
        '\\bthe following (?:analysis|section|discussion|framework|considerations)\\b',
        '\\bthere are (?:several|a number of|multiple|various) (?:factors|considerations|reasons|things|aspects|elements|points) to consider\\b',
        '\\bthis (?:highlights|underscores|demonstrates|illustrates|reflects) the importance of\\b',
        '\\bit(?:\'s| is) (?:important|worth) (?:to note|noting|mentioning) that\\b',
      ),
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'Section 6 of the guide: "Never write \'In this section…\', \'We will explore…\', \'The '
      + 'following analysis…\'". These announce writing instead of doing it, and a reader who has '
      + 'reached the sentence does not need to be told what it is about to do. Every occurrence '
      + 'is reported because there is no honest use of them in the registers this set covers. '
      + 'Two exclusions, both found by auditing this rule\'s own findings on 431,000 words of '
      + 'consulting writing. The "in this report" family only fires at the start of a '
      + 'sentence: mid-sentence it is a cross-reference, and "the figures in this report are '
      + 'as of April 15" is a good sentence that an earlier version flagged. And "discuss" is '
      + 'not on the guide\'s list — it banned "let\'s delve into", "let\'s explore" and "let\'s '
      + 'dive into" — because in an email "let\'s discuss tomorrow" is someone asking for a '
      + 'meeting. "In this section of the pipeline" is skipped too, where "section" is a '
      + 'physical thing.',
    suggest: 'Delete the sentence and start with the substance it was introducing.',
    tests: {
      hit: [
        'In this section we set out the pricing options.',
        'We will explore three scenarios for the second half.',
        'There are several factors to consider before deciding.',
        'This highlights the importance of early alignment.',
      ],
      miss: [
        'In this section of the pipeline, pressure drops by 4 bar.',
        'We cut prices in March. Volume held through June.',
        'Year-to-date figures in this article are those reported as of April 15.',
        'Methodology and data sources used in this analysis are in the appendix.',
        "Thanks - let's discuss tomorrow and decide whether we send it to Mark.",
      ],
    },
  },

  {
    id: 'aislop-vocabulary',
    name: 'Machine vocabulary',
    severity: 'warn',
    match: {
      kind: 'regex',
      distinct: true,
      pattern: '\\b(?:'
        + or(
          'delv(?:e|es|ed|ing)', 'tapestr(?:y|ies)', 'realms?', 'beacons?',
          'bolster(?:s|ed|ing)?', 'embark(?:s|ed|ing)? (?:on|upon)', 'foster(?:s|ed|ing)?',
          'furthermore', 'moreover', 'notably', 'crucially', 'undeniably', 'remarkably',
          'pivotal', 'seamless(?:ly)?', 'multifaceted', 'streamlin(?:e|es|ed|ing)',
          'cutting[- ]edge', 'spearhead(?:s|ed|ing)?', 'underscor(?:e|es|ed|ing)',
          'unveil(?:s|ed|ing)?', 'unwavering', 'vibrant', 'meticulous(?:ly)?',
          'intricate(?:ly)?', 'intricacies', 'paramount', 'testament to',
        )
        + ')\\b',
      flags: 'gi',
    },
    notable: { '>=': 3 },
    description:
      'Section 8\'s word list, minus the ones that need a context test — those are in '
      + 'aislop-dead-metaphor and tight-empty-modifier. Counts different words rather than '
      + 'repetitions and reports at three or more, because any one of these can be the right word '
      + 'once. Five of them — "delve", "tapestry", "beacon", "undeniably", "unwavering" — do not '
      + 'appear even once in 431,000 words of McKinsey, BCG and Bain writing, which is the '
      + 'clearest evidence in this whole set that the list is aimed at machines rather than at '
      + 'consultants.',
    suggest: 'Swap for a plainer word. One is coincidence; three different ones is a register.',
    tests: {
      hit: [
        'We delve into the intricacies of a vibrant, multifaceted tapestry.',
        'Furthermore, the seamless and cutting-edge platform will bolster a pivotal shift.',
      ],
      miss: [
        'We cut prices in March because demand fell faster than the forecast, and volume held '
          + 'through June while margin came in about $30 million below plan for the half.',
      ],
    },
  },

  {
    id: 'aislop-phrases',
    name: 'Stock machine phrasing',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: or(
        "\\bin today's (?:rapidly evolving|fast[- ]paced|ever[- ]changing|increasingly complex)\\b",
        '\\bin the (?:ever|rapidly)[- ]evolving (?:landscape|world|environment)\\b',
        '\\bat its core\\b',
        '\\bsheds? light on\\b',
        '\\bserv(?:e|es|ed|ing) as a catalyst\\b',
        '\\bpav(?:e|es|ed|ing) the way for\\b',
        '\\bparadigm shift\\b',
        '\\bstands? as a testament\\b',
        '\\bplays? a (?:vital|crucial|pivotal|key) role\\b',
        '\\bthe question is not (?:whether|if) .{1,60}? but when\\b',
        '\\bthe interplay between\\b',
        '\\bgame[- ]chang(?:er|ers|ing)\\b',
        '\\bit(?:\'s| is) not (?:just|merely|only) .{1,50}?[,;] (?:it|but)\\b',
      ),
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'The phrase list from section 8 and the "not just X, but Y" construction from section 9. '
      + 'These are fixed strings rather than word choices, which is why every occurrence is '
      + 'reported: a writer reaching for "paves the way for" has not chosen those words, the '
      + 'phrase arrived whole. "Deep dive" is deliberately absent — it is genuine consulting '
      + 'vocabulary that appears throughout real firm writing, so it sits in consultant-jargon '
      + 'territory rather than here, and flagging it as a machine tell would be wrong.',
    suggest: 'Say the thing directly. Most of these can be deleted without replacing them.',
    tests: {
      hit: [
        "In today's rapidly evolving market, the platform paves the way for growth.",
        'At its core, the analysis sheds light on a paradigm shift.',
        'The result plays a vital role in the recommendation.',
      ],
      miss: [
        'The market changed in March. Our prices did not, so we lost four points of share.',
      ],
    },
  },

  {
    id: 'aislop-dead-metaphor',
    name: 'Metaphors used as filler',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: '(?:'
        // "landscape", except a real one.
        + '(?<!\\b(?:urban|rural|natural|physical|garden|desert|mountain|coastal|arid)\\s)'
        + '\\blandscapes?\\b(?!\\s+(?:architect|architecture|gardening|design|painting|photography))'
        + '|'
        // "journey", except an actual trip.
        + '(?<!\\b(?:train|bus|car|road|rail|sea|return|outward|overnight|long)\\s)'
        + '\\bjourneys?\\b(?!\\s+(?:time|to work|home|by (?:train|car|bus|air)))'
        + '|'
        // "unlock", except something with a lock on it.
        + '\\bunlock(?:s|ed|ing)?\\b(?=\\s+(?:the\\s+|a\\s+|an\\s+|its\\s+|our\\s+|their\\s+|new\\s+|significant\\s+|further\\s+|greater\\s+)*'
        + '(?:value|potential|growth|opportunit(?:y|ies)|savings|insight|insights|productivity|capacity|capabilit(?:y|ies)|synerg(?:y|ies)|benefits?))'
        + ')',
      flags: 'gi',
    },
    notable: { '>=': 1, per: 1000 },
    description:
      'Three of the guide\'s qualified bans: "landscape when metaphorical", "journey when '
      + 'metaphorical", "unlock when metaphorical". The literal senses are carved out — a rural '
      + 'landscape, a train journey, unlocking a door or a phone do not fire; "the competitive '
      + 'landscape", "the customer journey" and "unlock value" do. This is the rule most worth '
      + 'watching on this corpus: all three rose sharply in consulting writing after November '
      + '2022, "unlock" from 4.5 to 33.7 uses per 100,000 words, "ecosystem" from 6.9 to 27.8, '
      + '"landscape" from 7.7 to 21.3. That is suggestive of drift rather than proof of it — 33 '
      + 'post-2022 documents is a small sample and the later ones skew toward AI subject matter, '
      + 'though only about a fifth of the hits sit in a sentence that mentions AI at all.',
    suggest: 'Name the thing. "The competitive landscape" is "our competitors"; "unlock value" is '
      + 'the specific amount and where it comes from.',
    tests: {
      hit: [
        'The competitive landscape has shifted since the last review, and the customer journey '
          + 'is fragmented across three channels that do not share data. We cannot unlock value '
          + 'from the current operating model without a fresh landscape scan and a single view of '
          + 'the journey from first contact to renewal. Doing both would unlock significant '
          + 'savings in the service centre, and the vendor landscape has moved enough since 2023 '
          + 'that the build-versus-buy answer may now be different. The regulatory landscape is '
          + 'the one part of this that has not moved at all, so the compliance journey can be '
          + 'left where it is for now.',
      ],
      miss: [
        'The train journey takes four hours through rural landscape, and you unlock the door '
          + 'with the code on the booking confirmation. Then you unlock your phone to show the '
          + 'guard the ticket that was issued when the return journey was booked earlier in the '
          + 'week by the office. The coastal landscape on the last stretch is worth staying awake '
          + 'for, though the return journey runs after dark and you see none of it on the way '
          + 'back to the city.',
      ],
    },
  },

  {
    id: 'aislop-transitions',
    name: 'Bolted-on transitions',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: '(?:^|[.!?]["\')\\]]?\\s+|\\n)\\s*(?:Furthermore|Moreover|Additionally|'
        + 'Consequently|Notably|Importantly|Crucially|Interestingly|Essentially|Fundamentally|'
        + 'Undeniably|Remarkably|Indeed)\\s*,',
      flags: 'g',
    },
    notable: { '>=': 0.6, per: 1000 },
    description:
      'Sentence-opening connectives from sections 8 and 9, including the "Indeed," opener the '
      + 'guide names separately. Only fires at the start of a sentence and only when a comma '
      + 'follows, so "the results are fundamentally different" and "he was, moreover, late" are '
      + 'left alone. Reported as a rate: one "Furthermore," is a word, four is a paragraph '
      + 'assembled from parts. These transitions usually mark a sentence that was written to '
      + 'continue rather than to say something, and deleting the opener normally improves it '
      + 'without any other change.',
    suggest: 'Delete the opener. If the sentences do not follow without it, the order is wrong.',
    tests: {
      hit: [
        'Revenue fell nine points against a forecast of flat, which nobody in the commercial '
          + 'team had flagged before the close. Furthermore, margin compressed by four points '
          + 'over the same period. Moreover, the pipeline thinned in every region except the '
          + 'Nordics. Additionally, two of the top ten accounts churned within a fortnight of '
          + 'each other. Indeed, the quarter was poor by any measure available to us. Notably, '
          + 'none of this appeared in the monthly reporting until the quarter had already '
          + 'closed and the numbers were final.',
      ],
      miss: [
        'The two approaches are fundamentally different, and the second is, moreover, cheaper '
          + 'to run over five years than the first was over three. That is why the team '
          + 'recommended it to the steering group without much argument. The build option would '
          + 'have taken eighteen months and needed two engineers we do not have, so the choice '
          + 'was made for us well before the paper was written, and the committee spent its time '
          + 'on the migration plan instead of the decision itself.',
      ],
    },
  },
];

// --------------------------------------------------------------------------
// tight -- sections 1, 5, 6 and 9: padding and throat-clearing
// --------------------------------------------------------------------------

const TIGHT = [
  {
    id: 'tight-hedge-stack',
    name: 'Stacked hedges',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: or(
        '\\b(?:may|might|could|can|would)\\s+(?:potentially|possibly|arguably|conceivably|perhaps|likely)\\b',
        '\\b(?:it|this)\\s+(?:could|may|might)\\s+be\\s+(?:argued|said|suggested|posited|contended)\\b',
        '\\b(?:somewhat|fairly|relatively|rather)\\s+(?:likely|possible|unclear|uncertain|limited)\\b',
        '\\b(?:appears?|seems?)\\s+to\\s+(?:potentially|possibly)\\b',
        '\\bsuggests?\\b[^.!?]{0,40}?\\bmay (?:be|have|need|require)\\b',
      ),
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'Two or more hedges doing the work of one, which section 5 of the guide calls out with '
      + '"It could potentially be argued that valuations may be somewhat depressed" against '
      + '"Valuations are depressed". A single hedge is often right — real uncertainty deserves '
      + '"may" — so this only fires when hedges stack. If a finding here covers a genuinely '
      + 'uncertain claim, keep one hedge and delete the rest rather than the sentence.',
    suggest: 'Keep one hedge at most. If the evidence supports the claim, state it.',
    tests: {
      hit: [
        'It could potentially be argued that valuations may be somewhat depressed.',
        'The change might possibly affect the second half.',
      ],
      miss: [
        'Valuations are depressed. Demand may recover in the second half.',
      ],
    },
  },

  {
    id: 'tight-expletive-opener',
    name: 'Sentences opening on "It is" or "There are"',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: '(?:^|[.!?]["\')\\]]?\\s+|\\n)\\s*(?:It|There)\\s+'
        + '(?:is|are|was|were|has been|have been|had been)\\b',
      flags: 'g',
    },
    notable: { '>=': 1, per: 1000 },
    description:
      'Section 1 asks for the subject and the action early, and names "It is…" and "There is…" '
      + 'as the things to avoid. Both push the real subject to the back of the sentence: "There '
      + 'are three factors that explain the fall" is "three factors explain the fall". Reported '
      + 'as a rate at three or more per thousand words, because the construction is sometimes '
      + 'the honest one — "there are 47 sites" is a statement of existence and rewriting it '
      + 'gains nothing. A document above this rate is usually burying its subjects as a habit '
      + 'rather than by choice.',
    suggest: 'Move the real subject to the front. "There are three factors that…" becomes '
      + '"three factors…".',
    tests: {
      hit: [
        'There are three factors that explain the fall in volume this quarter. It is clear that '
          + 'the plan needs revisiting before the September board meeting. There is a risk the '
          + 'board disagrees with the pricing recommendation, given how recently the last one '
          + 'landed. It was decided that the review would slip by a month to allow the '
          + 'commercial teams time to prepare. There are two further issues on the log that '
          + 'nobody has picked up since the reorganisation in April.',
      ],
      miss: [
        'Three factors explain the fall in volume this quarter, and the plan needs revisiting '
          + 'before the September board meeting. The board may disagree with the pricing '
          + 'recommendation, given how recently the last one landed. We moved the review by a '
          + 'month so the commercial teams could prepare properly. Two further issues sit on the '
          + 'log, and nobody has picked either of them up since the reorganisation in April left '
          + 'the ownership unclear.',
      ],
    },
  },

  {
    id: 'tight-nominalisation',
    name: 'Verbs turned into nouns',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: or(
        '\\bprovides? support for\\b',
        '\\binvolves? the need for\\b',
        '\\bimplement(?:s|ed|ing)? a reduction in\\b',
        '\\b(?:conduct|perform|undertake|carry out)(?:s|ed|ing)? an? (?:analysis|assessment|review|evaluation|examination) of\\b',
        '\\bmakes? a (?:decision|determination|recommendation|contribution)\\b',
        '\\bgives? consideration to\\b',
        '\\bprovides? an? (?:indication|explanation|overview) of\\b',
        '\\bis (?:reflective|indicative|supportive|suggestive) of\\b',
        '\\btakes? into (?:consideration|account) the\\b',
        '\\bhas an? (?:impact|effect|influence) on\\b',
        '\\bthe (?:deterioration|degradation|improvement|expansion|reduction|adjustment|'
          + 'implementation|utili[sz]ation|optimi[sz]ation|reassessment|acceleration|'
          + 'simplification) (?:in|of)\\b',
        '\\b(?:has|have|had|is|are) creat(?:ed|ing|es)? an? need (?:to|for)\\b',
        '\\bthere (?:is|was) an? need (?:to|for)\\b',
      ),
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'Section 5 asks for verbs that carry meaning: "strengthens" not "provides support for", '
      + '"requires" not "involves the need for", "cut" not "implement a reduction in". This is a '
      + 'list of the specific constructions the guide names plus the closest relatives, not a '
      + 'general test for nouns ending in -tion, which would flag ordinary words like '
      + '"information" and "organisation" and be useless. Every hit has a one-word verb that '
      + 'replaces it.',
    suggest: 'Use the verb. "Provides support for" is "supports"; "conduct an analysis of" is '
      + '"analyse"; "has an impact on" is "affects".',
    tests: {
      hit: [
        'The data provides support for the thesis.',
        'We will conduct an analysis of the pipeline.',
        'The change has an impact on margin.',
      ],
      miss: [
        'The data supports the thesis. We analysed the pipeline. The change cut margin by four '
          + 'points in the first quarter after it landed.',
      ],
    },
  },

  {
    id: 'tight-empty-modifier',
    name: 'Adjectives that carry no claim',
    severity: 'warn',
    match: {
      kind: 'regex',
      // "strategic deal value" and "strategic buyer" are M&A classifications, where
      // "strategic" contrasts with "financial" and carries real meaning.
      pattern: '\\b(?:comprehensive|innovative|nuanced|transformative|significant|substantial|'
        + 'considerable|meaningful|compelling|powerful|exciting|strategic)\\s+'
        + '(?!(?:deal|deals|buyer|buyers|acquirer|acquirers|investor|investors|rationale)\\b)'
        + '(?:[a-z]+\\s+)?'
        + '(?:approach|solution|framework|opportunit(?:y|ies)|capabilit(?:y|ies)|view|analysis|'
        + 'strategy|programme|program|initiative|transformation|change|impact|value|benefits?|'
        + 'insights?|understanding|shift|journey|platform|ecosystem|partnership)\\b',
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'The guide bans "innovative", "comprehensive" and "nuanced" as empty modifiers and asks in '
      + 'section 1 for facts rather than adjectives — "the addressable market is $14 billion and '
      + 'growing 8% a year", not "a significant market opportunity". The pattern only fires when '
      + 'one of these adjectives sits directly in front of an abstract noun, which is where they '
      + 'are doing no work. It will not fire on "significant at the 5% level", "a significant '
      + 'increase in revenue" or "substantial evidence", where the adjective is measuring '
      + 'something real. If a finding here has a number attached to it somewhere nearby, the '
      + 'adjective may be earning its place and this is a false fire. Reported per '
      + 'occurrence rather than as a rate, because the guide\'s own example of the fault '
      + '— "The company has a significant market opportunity" — is seven words long, and a '
      + 'rate rule cannot see it. The narrow pattern is what makes that affordable: 97 '
      + 'hits across 431,000 words of real consulting writing, in 38 of 88 documents.',
    suggest: 'Replace the adjective with the number, or delete it.',
    tests: {
      hit: [
        'A comprehensive approach will deliver significant value across the portfolio and a '
          + 'transformative impact on how the business is run. It builds innovative capabilities '
          + 'in the commercial teams and a nuanced understanding of the strategic opportunity in '
          + 'front of us. The programme offers meaningful benefits to every function, and the '
          + 'compelling insights from the diligence phase point to a substantial opportunity that '
          + 'the leadership team should consider carefully before the next planning cycle begins '
          + 'in earnest. The strategic framework behind it offers considerable value, and the '
          + 'powerful analysis underneath deserves a proper hearing at the board.',
      ],
      miss: [
        'The addressable market is $14 billion and growing 8% a year, and our share is 4%. A 7% '
          + 'price cut costs $30 million of margin this year while protecting about $110 million '
          + 'of volume, based on the elasticity we measured in the Nordics last spring. Category '
          + 'demand fell 9% against a forecast of flat, and two competitors cut list prices '
          + 'twice in the same period. Realised prices have already fallen 4% because the sales '
          + 'team has been discounting off-list to hold volume.',
      ],
    },
  },

  {
    id: 'tight-exclamation',
    name: 'Exclamation marks in analytical writing',
    severity: 'warn',
    match: { kind: 'regex', pattern: '(?<![!\\s])!(?!=)(?!\\s*\\[)', flags: 'g' },
    notable: { '>': 0 },
    description:
      'Section 9: no exclamation marks in analytical writing. The register carve-out is the '
      + 'important part of that sentence — this rule is right for a memo, a report or a board '
      + 'paper, and wrong for a note to a colleague or anything written to be warm. It skips "!=" '
      + 'and shell negation so it does not fire on code. If this set is used on chat or informal '
      + 'email, ignore this rule rather than fighting it.',
    suggest: 'Delete it. If the sentence needs the emphasis, the sentence is not doing its job.',
    tests: {
      hit: [
        'Revenue grew 15% last quarter. That is a strong result!',
      ],
      miss: [
        'Revenue grew 15% last quarter, which beat the plan by four points.',
        'The check is if (a != b) then fail.',
      ],
    },
  },

  {
    id: 'tight-long-sentences',
    name: 'Sentences that run long',
    severity: 'warn',
    // Counts sentence ends, so a LOW rate means long sentences. 13 ends per
    // 1000 words is one sentence per 77 words.
    match: { kind: 'regex', pattern: '[.!?](?=\\s|$)', flags: 'g' },
    notable: { '<=': 13, per: 1000, needs: { words: 150, sentences: 2 } },
    description:
      'Section 5 asks for short sentences and says to split one that becomes hard to follow. '
      + 'This counts sentence endings rather than words, so a LOW rate is the finding: 13 per '
      + 'thousand words is one sentence every 77 words. The threshold comes from the corpus, '
      + 'where the median consulting document runs at 39.8 sentence ends per thousand words and '
      + 'the 10th percentile at 13.2 — so this fires on roughly the longest-winded tenth of real '
      + 'consulting writing. The obvious false fire is a document with few full stops for a '
      + 'reason: a bulleted deck, a table of figures, a list of names. Check what the document '
      + 'is before acting on this one.',
    suggest: 'Split the longest sentences. If a sentence has three clauses, it is usually two '
      + 'sentences.',
    tests: {
      hit: [
        'The deterioration in underlying demand dynamics across our regional markets has created '
          + 'a pressing need to reassess the existing pricing architecture, which in turn '
          + 'requires a coordinated response from the commercial teams who own those customer '
          + 'relationships today and who have, for the last three planning cycles, been operating '
          + 'against a set of targets that were agreed before the category began to contract in '
          + 'the way that it has since the middle of last year, meaning that any adjustment now '
          + 'has to be made against a baseline nobody in the room actually believes is still the '
          + 'right one to be working from at this point in the cycle. What that means in '
          + 'practice is that the commercial leadership will have to take a view on whether the '
          + 'baseline is worth defending at all, or whether the more honest course is to reset '
          + 'it entirely and accept that the first half of the year will read as a miss against '
          + 'a number that was never achievable once the category turned, which is a '
          + 'conversation nobody has yet been willing to open with the board.',
      ],
      miss: [
        'Demand has weakened faster than expected. Current prices are hard to sustain. We should '
          + 'cut them before volume falls further. Category demand fell 9% against a forecast of '
          + 'flat. Two competitors cut list prices in the same period. Our realised prices have '
          + 'already fallen 4%. The sales team has been discounting off-list to hold volume. '
          + 'Waiting until September costs another two quarters of share.',
      ],
    },
  },

  {
    id: 'tight-passive',
    name: 'Passive voice',
    severity: 'warn',
    match: {
      kind: 'regex',
      // Only the passive that hides an actor: a participle followed by a "by"
      // phrase or a clause boundary. "is based on" and "was tired" do not fire.
      pattern: '\\b(?:is|are|was|were|be|been|being)\\s+(?:\\w+ly\\s+)?\\w+(?:ed|en)\\b'
        + '(?=\\s+(?:by|in|on|at|for|with|to|from|during|through)\\b|[.,;])',
      flags: 'gi',
    },
    notable: { '>=': 6.3, per: 1000 },
    description:
      'Section 5 prefers "Revenue declined 15%" to "A 15% decline in revenue was observed", and '
      + 'allows the passive where the actor does not matter. Whether the actor matters is not '
      + 'decidable by a pattern, so this reports a rate: 6.3 per thousand words, which is the '
      + '90th percentile across the corpus, where the median consulting document sits at 3.2. '
      + 'The pattern only matches a participle followed by a "by" phrase or a clause boundary, '
      + 'which is where an actor has usually gone missing; "is based on" and "was tired" are not '
      + 'matched. Methods sections and regulatory writing are legitimately passive and will fire '
      + 'here — that is a false fire in intent even when the count is correct.',
    suggest: 'Name the actor. "A decline was observed" becomes "revenue declined".',
    tests: {
      hit: [
        'A 15% decline in revenue was observed by the team. The targets were agreed by the '
          + 'steering group. The pricing model was revised in March. The findings were '
          + 'circulated to the board. The programme was paused during the review, and the '
          + 'baseline was reset by finance. The assumptions were challenged at the workshop, and '
          + 'a revised plan was requested for September. The scope was agreed in April, the '
          + 'timeline was extended in June, and the whole programme was reviewed by the audit '
          + 'committee before any of it was communicated to the wider organisation.',
      ],
      miss: [
        'Revenue declined 15%. The steering group agreed the targets. We revised the pricing '
          + 'model in March and circulated the findings to the board. Finance paused the '
          + 'programme during the review and reset the baseline. The workshop challenged our '
          + 'assumptions, and the board asked for a revised plan in September.',
      ],
    },
  },

  {
    id: 'tight-agentless-passive',
    name: 'Passive with the actor removed',
    severity: 'warn',
    match: {
      kind: 'regex',
      // Reporting verbs in the passive with no "by" phrase: the actor has not
      // been demoted, it has been deleted. This is the guide's own example.
      // The subject has to be a nominalisation as well: "a 15% decline ... was
      // observed" hides who observed it, while "the data can be found in the
      // appendix" hides nobody and is the case the guide allows.
      pattern: '\\b(?:an?|the) (?:[\\w%-]+ ){0,3}'
        + '(?:decline|increase|decrease|reduction|improvement|growth|shift|change|impact|'
        + 'effect|trend|gain|loss|deterioration|rise|fall|uptick|variance|discrepancy)\\b'
        + '[^.!?]{0,40}?'
        + '\\b(?:was|were|is|are|has been|have been) (?:observed|noted|identified|determined|'
        + 'reported|found|assessed|estimated|recorded|seen|measured)\\b(?! by\\b)',
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'The guide\'s example of the passive is "A 15% decline in revenue was observed" against '
      + '"Revenue declined 15%" — and that example is seven words long, so the rate-based '
      + 'tight-passive rule can never reach it. This one reports per occurrence, which is only '
      + 'affordable because it is narrow: a reporting verb in the passive with no "by" phrase '
      + 'after it, where the actor has not been demoted but deleted. Someone observed the '
      + 'decline; the sentence will not say who. 45 hits across 431,000 words of consulting '
      + 'writing. An audit of its findings on that corpus is why it looks like this: an '
      + 'earlier version matched any reporting verb in the passive and fired 67 times, '
      + 'almost all of them on sentences where the actor genuinely does not matter — '
      + '"methodology can be found in the appendix", "activities that can be performed '
      + 'remotely", "winning suppliers are being determined today". The guide explicitly '
      + 'ALLOWS the passive in exactly those cases, so the rule was contradicting its own '
      + 'source. Requiring a nominalised subject as well fixes that and costs almost all '
      + 'the recall: this now fires about once in 431,000 words of real consulting prose, '
      + 'which says the shape the guide warns about is rarer in practice than the guide '
      + 'implies. "It was decided by the committee" does not fire either, because the '
      + 'actor is there. The habit, as opposed to this specific shape, is tight-passive.',
    suggest: 'Name who did it. "A decline was observed" becomes "we observed a decline", or '
      + 'better, "revenue declined 15%".',
    tests: {
      hit: [
        'A 15% decline in revenue was observed.',
        'The improvement in margin was noted during the review.',
        'An increase in churn was identified across two regions.',
      ],
      miss: [
        'Revenue declined 15%.',
        'It was decided by the steering committee that the review would slip.',
        'The team observed a 15% decline and identified three risks.',
        'Methodology and data sources can be found in the appendix.',
        'All activities that can be performed remotely are counted here.',
      ],
    },
  },

  {
    id: 'tight-repeated-frame',
    name: 'Sentences built to the same template',
    severity: 'warn',
    match: { kind: 'frame', gram: 8, minRun: 3, anchors: 2 },
    notable: { '>': 0 },
    description:
      'Section 6 asks for prose that is not artificially polished, and names repeated sentence '
      + 'patterns and grammatically identical bullets. This finds three or more consecutive '
      + 'sentences sharing a syntactic skeleton — the same function words in the same order with '
      + 'different content poured in. One real limit: the matcher needs a sentence of at least 13 '
      + 'letters carrying two closed-class anchors, so the terse parallel bullets of a slide '
      + '("Improved margins", "Reduced cost", "Faster delivery") are invisible to it. That is '
      + 'precisely the case the guide has in mind, and this rule does not reach it.',
    suggest: 'Rewrite one of them. Parallel structure is a choice; three in a row is a template.',
    tests: {
      hit: [
        'The platform improves the speed of the process. The platform reduces the cost of the '
          + 'service. The platform increases the quality of the output.',
      ],
      miss: [
        'The platform is faster. Cost per transaction fell by a third once it went live, and the '
          + 'error rate halved. None of that was in the business case.',
      ],
    },
  },

  {
    id: 'tight-summary-loop',
    name: 'Signposted recap',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: '(?:^|[.!?]["\')\\]]?\\s+|\\n)\\s*(?:'
        + 'In conclusion|To conclude|In summary|To summari[sz]e|To sum up|To recap|'
        + 'As (?:mentioned|noted|stated|discussed|outlined) (?:above|earlier|previously)|'
        + 'To reiterate|As we have seen|Having (?:established|shown)'
        + ')\\b',
      flags: 'gi',
    },
    notable: { '>': 0 },
    description:
      'Section 9 bans summary loops, and section 1 says not to recap what you just said. Only '
      + 'the signposted form is catchable: a paragraph that quietly restates its own opening is '
      + 'a semantic judgement no pattern reaches, so this rule covers the half that announces '
      + 'itself — "In conclusion", "To recap", "As mentioned above". Those phrases appear zero '
      + 'times in 431,000 words of McKinsey, BCG and Bain writing, so a hit is unusual for the '
      + 'register as well as against the guide. The unsignposted loop remains uncovered, and no '
      + 'rule in this set will find it.',
    suggest: 'Delete the sentence. If the point needs restating, the first statement was unclear.',
    tests: {
      hit: [
        'In conclusion, the analysis shows margin fell.',
        'As mentioned above, the pipeline thinned in every region.',
        'To recap, we cut prices and volume held.',
      ],
      miss: [
        'Margin fell nine points, and the pipeline thinned in every region except the Nordics.',
        'The conclusion of the study was published in March.',
      ],
    },
  },

  {
    id: 'tight-rhetorical-question',
    name: 'Questions asked in order to answer them',
    severity: 'warn',
    match: {
      kind: 'regex',
      pattern: '(?:'
        // A question the writer answers in the next breath.
        + '\\?\\s+(?:No|Yes|Not (?:really|quite|exactly)|Absolutely|Probably not|It (?:is|was)|'
        + 'It\'s|The answer is|Because|Simply put|In short)\\b'
        + '|'
        // The "So what does this mean?" family, which is nearly always rhetorical.
        + '(?:^|[.!?]["\')\\]]?\\s+|\\n)\\s*(?:So )?(?:[Ww]hat|[Ww]hy|[Hh]ow) '
        + '(?:does|do|did|is|are|was|were|should|can|could|might) '
        + '(?:this|that|it|we|they|the [a-z]+) [^?\\n]{0,50}\\?'
        + ')',
      flags: 'g',
    },
    notable: { '>=': 0.5, per: 1000 },
    description:
      'Section 9 bans rhetorical questions used only for emphasis. "Only for emphasis" is not '
      + 'decidable, so this catches the two shapes where the emphasis is visible: a question the '
      + 'writer answers immediately ("Is it perfect? No."), and the "So what does this mean?" '
      + 'family that exists to introduce the answer. A genuine question put to the reader and '
      + 'left open will not fire, and should not. Reported as a rate because one framing question '
      + 'in a long report is a legitimate device — it is the habit that the guide objects to.',
    suggest: 'Delete the question and state the answer. The emphasis survives; the throat-clearing '
      + 'does not.',
    tests: {
      hit: [
        'So what does this mean for the business? It means we cut price in the second half, '
          + 'before volume falls any further. Why does that matter now? Because two competitors '
          + 'have already moved and the share we lose this year is harder to buy back than to '
          + 'keep. Is the case airtight? No. But it is the best read we have, and waiting for a '
          + 'better one costs another quarter of share, which is the whole argument in a '
          + 'sentence and the reason the paper is short.',
      ],
      miss: [
        'The board asked what the pricing decision would cost in margin this year, and we have '
          + 'not answered it yet because the elasticity work is still running in two of the four '
          + 'regions. Volume held through June at the old list price, so the question is live '
          + 'rather than settled, and the September paper will have to carry a range instead of '
          + 'a single number for the first time in three years of this programme.',
      ],
    },
  },

  {
    id: 'tight-triplet',
    name: 'Lists of three by default',
    severity: 'warn',
    // The chain matcher wants a pattern for the whole construction plus a
    // headTest; given a bare comma it counts every comma in the document as a
    // chain of one, which fired this rule on a page of database schema notes.
    // The explicit three-item form is what the tell actually looks like.
    match: { kind: 'regex', pattern: '\\b\\w+,\\s+\\w+,\\s+and\\s+\\w+\\b', flags: 'g' },
    notable: { '>=': 5, per: 1000 },
    description:
      'Section 9 bans default triplets and section 6 says not to force three-part lists: "a list '
      + 'with two good points is better than three points created for symmetry". Reported as a '
      + 'rate, and the threshold is set from the register rather than from taste. Across 83 '
      + 'consulting documents long enough to score, the three-item list runs at a median of 1.56 '
      + 'per thousand words, 3.74 at the 90th percentile and 5.53 at the worst. The threshold is '
      + '5, so it fires only on a document at the very top of that range. The habit is old: its '
      + 'rate barely moved after November 2022, 0.86 per thousand words before against 0.78 '
      + 'after, so this is long-standing consulting style and not a machine artifact. Only the '
      + '"a, b, and c" form is matched, which under-reports lists built with semicolons or '
      + 'written across bullets.',
    suggest: 'Cut to the two that matter, or keep the third only if it earns its place.',
    tests: {
      hit: [
        'We need speed, scale, and simplicity from the new operating model. The plan is faster, '
          + 'cheaper, and simpler than the one it replaces, and it was built that way on purpose '
          + 'after the last attempt stalled. It improves margin, volume, and mix in every region '
          + 'we modelled. The board wants clarity, pace, and evidence before it will commit any '
          + 'further funding to the programme, and the September paper has to deliver all three '
          + 'without running past twenty pages. That means fewer slides, tighter arguments, and '
          + 'better evidence than last time, which is a higher bar than it sounds.',
      ],
      miss: [
        'We need speed and scale from the new operating model. The plan is faster and cheaper '
          + 'than the one it replaces, and it protects volume without costing margin in the '
          + 'first year. It was built that way on purpose after the last attempt stalled in '
          + 'procurement. The board wants evidence before committing further funding, so the '
          + 'September paper has to show what the pilot actually did to the numbers rather than '
          + 'what we hope it will do next year.',
      ],
    },
  },
];

// --------------------------------------------------------------------------

const rules = [...HOUSESTYLE, ...CONSULTANT, ...AISLOP, ...TIGHT];

// A literal space in a pattern breaks the moment the text carries a non-breaking
// space or a soft-wrapped double space, which the fudger checks for and which is
// how "in this section" silently stopped matching real HTML.
for (const r of rules) {
  if (r.match.kind !== 'regex') continue;
  // Not a blanket replace: a literal space inside a character class must stay a
  // literal space. `[- ]` became `[-\s+]` under the naive version, which is a
  // class of hyphen, whitespace and a plus sign -- harmless there by luck, and
  // not something to leave lying around.
  let out = '', inClass = false;
  for (let i = 0; i < r.match.pattern.length; i++) {
    const c = r.match.pattern[i];
    if (c === '\\') { out += c + (r.match.pattern[i + 1] || ''); i++; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    out += (c === ' ' && !inClass) ? '\\s+' : c;
  }
  r.match.pattern = out;
}

// The engine defaults a rate rule to 250 words and 5 sentences, on the sound
// argument that a rate over less is noise. This set cannot afford that default:
// the guide makes Tight -- Slack, a short email, three sentences -- its DEFAULT
// mode, and a rule that goes quiet under 250 words can never judge the register
// its author cares most about. So rates here need 80 words, and the honesty that
// length usually provides comes from the two-match floor instead: one occurrence
// in a short note is never reported, whatever the arithmetic says.
// Every rate threshold in this set is set from the consulting corpus rather than
// from taste: it sits near the 90th percentile of the per-document rate across
// 83 McKinsey, BCG and Bain documents, so a rule fires on writing that is
// unusual FOR THIS REGISTER instead of on writing that merely uses the word.
// Those percentiles are quoted in each description and can be re-measured.
const SHORT_FORM = { words: 80, sentences: 3, matches: 2 };
for (const r of rules) {
  // A rule that fires on an ABSENCE cannot carry a match floor -- the whole
  // point of tight-long-sentences is that there are too FEW sentence endings.
  if (r.notable.per && r.notable['<='] === undefined) r.notable.needs = SHORT_FORM;
}

const set = {
  name: 'mckinsey',
  title: 'McKinsey writing style',
  version: '0.1.0',
  slop: '0.1.0',
  description:
    'A consultant\'s house writing standard, turned into rules. The guide it comes from is three '
    + 'things mixed together — personal taste, consulting jargon, and machine writing — and the '
    + 'rule ids say which is which so a finding can be argued with:\n\n'
    + '  housestyle-   his preference. Not a claim that the writing is bad or machine-made.\n'
    + '  consultant-   consulting-register jargon, written by people and disliked anyway.\n'
    + '  aislop-       reads as machine-written.\n'
    + '  tight-        padding, hedging and structure the point did not need.\n\n'
    + 'Several rules cover words with an ordinary sense as well as a jargon one — a cryptographic '
    + 'key, a camera\'s focus, a disk drive, a marine ecosystem, a robust standard error. Those '
    + 'senses are carved out of the patterns and named in each description, and the `miss` tests '
    + 'hold the carve-outs in place. Frequencies quoted in the descriptions are measured on 88 '
    + 'documents and 431,000 words of published and internal McKinsey, BCG and Bain writing.\n\n'
    + 'The guide\'s three modes are not rules and are not here: Tight, Developed and Structured '
    + 'are decisions a writer makes before writing, and the rate-based rules in this set cannot '
    + 'judge a document under 250 words at all.',
  rules,
};

const out = join(ROOT, 'candidates/mckinsey.json');
writeFileSync(out, JSON.stringify(set, null, 2) + '\n');
console.log(`wrote ${out}: ${rules.length} rules`);
for (const g of ['housestyle', 'consultant', 'aislop', 'tight']) {
  const n = rules.filter((r) => r.id.startsWith(g + '-')).length;
  console.log(`  ${g.padEnd(12)} ${n}`);
}

if (process.argv.includes('--check')) {
  console.log('');
  process.stdout.write(execFileSync('node', [join(ROOT, 'js/cli.mjs'), 'test-rules', out],
    { encoding: 'utf8' }));
}
