#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('artifacts/dean-dashboard/src/data');

const ENGR_RANKS = {
  'Massachusetts Institute of Technology': 1,
  'Stanford University': 2,
  'University of California Berkeley': 3,
  'Carnegie Mellon University': 4,
  'Georgia Institute of Technology': 4,
  'California Institute of Technology': 6,
  'Purdue University': 6,
  'University of Michigan': 6,
  'University of Illinois Urbana-Champaign': 9,
  'Cornell University': 9,
  'University of Texas at Austin': 11,
  'Texas A&M University': 12,
  'University of California Los Angeles': 13,
  'University of California San Diego': 13,
  'University of Southern California': 13,
  'Princeton University': 13,
  'Northwestern University': 17,
  'University of Wisconsin Madison': 18,
  'Johns Hopkins University': 18,
  'Columbia University': 20,
  'Duke University': 21,
  'Pennsylvania State University': 22,
  'University of Maryland College Park': 23,
  'University of California Santa Barbara': 23,
  'Virginia Tech': 25,
  'North Carolina State University': 25,
  'Harvard University': 27,
  'University of Pennsylvania': 27,
  'Arizona State University': 29,
  'University of Minnesota Twin Cities': 30,
  'Rice University': 30,
  'Yale University': 32,
  'Ohio State University': 33,
  'University of California Davis': 34,
  'Vanderbilt University': 34,
  'University of Washington': 36,
  'University of Massachusetts Amherst': 37,
  'Boston University': 37,
  'University of California Irvine': 37,
  'Rensselaer Polytechnic Institute': 40,
  'New York University': 40,
  'University of Notre Dame': 40,
  'University of Pittsburgh': 43,
  'Brown University': 43,
  'Michigan State University': 43,
  'University of Florida': 46,
  'Iowa State University': 46,
  'Rutgers University': 46,
  'Stony Brook University': 49,
  'University of Colorado Boulder': 49,
  'Dartmouth College': 51,
  'Washington University in St. Louis': 51,
  'University of Connecticut': 53,
  'Tufts University': 53,
  'University at Buffalo': 55,
  'University of Houston': 55,
  'Auburn University': 57,
  'University of Iowa': 57,
  'University of Tennessee': 59,
  'University of Arizona': 59,
  'University of Colorado Denver': 61,
  'Florida State University': 62,
  'University of Kansas': 62,
  'University of Alabama at Birmingham': 64,
  'University of California Riverside': 64,
  'University of Oklahoma': 64,
  'Clemson University': 67,
  'University of Alabama': 67,
  'University of Cincinnati': 69,
  'University of New Mexico': 69,
  'University of Delaware': 69,
  'University of Utah': 72,
  'University of Kentucky': 73,
  'Louisiana State University': 74,
  'University of Missouri': 74,
  'University of Nebraska Lincoln': 74,
  'Oregon State University': 74,
  'Syracuse University': 74,
  'Case Western Reserve University': 79,
  'Colorado School of Mines': 79,
  'University of Texas at Dallas': 81,
  'University of Texas at Arlington': 81,
  'Washington State University': 81,
  'Wayne State University': 81,
  'New Jersey Institute of Technology': 85,
  'George Washington University': 85,
  'Mississippi State University': 85,
  'University of Maryland Baltimore County': 85,
  'Colorado State University': 89,
  'University of South Carolina': 89,
  'University of Central Florida': 89,
  'University of South Florida': 92,
  'University of Memphis': 92,
  'University of Louisville': 92,
  'University of Miami': 92,
  'University of Virginia': 41,
  'University of Rochester': 56,
  'University of Illinois at Chicago': 96,
  'University of New Hampshire': 96,
  'Florida International University': 99,
  'Indiana University Indianapolis': 99,
  'University of Idaho': 102,
  'University of Maine': 102,
  'University of North Dakota': 102,
  'North Dakota State University': 102,
  'Northeastern University': 49,
  'Texas Tech University': 102,
  'Oklahoma State University': 102,
  'Kansas State University': 102,
  'Utah State University': 102,
  'University of Mississippi': 102,
  'University of Arkansas': 102,
  'Montana State University': 102,
  'University of Hawaii at Manoa': 102,
  'University of Vermont': 102,
  'University of Alabama in Huntsville': 102,
  'West Virginia University': 102,
  'Boise State University': 102,
  'Ohio University': 102,
  'University of Nevada Las Vegas': 102,
  'University of Nevada Reno': 102,
  'University of Rhode Island': 102,
  'University of Texas at El Paso': 102,
  'University of Texas at San Antonio': 102,
  'Virginia Commonwealth University': 102,
  'Kent State University': 102,
  'George Mason University': 102,
  'Baylor University': 102,
  'Missouri University of Science and Technology': 79,
  'Indiana University Bloomington': null,
};

function update(file, mapper, label) {
  const filepath = path.join(DATA_DIR, file);
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  let changed = 0;
  for (const row of data) {
    const newRank = mapper(row);
    if (newRank !== undefined && row.rank !== newRank) {
      row.rank = newRank;
      changed++;
    }
  }
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`${file}: updated ${changed} rows (${label})`);
}

const eMapper = (row) => {
  if (row.university in ENGR_RANKS) return ENGR_RANKS[row.university];
  return null;
};

update('r1-eschool-schools.json', eMapper, 'US News 2024 Best Engineering Graduate Schools');
update('r1-eschool-research.json', eMapper, 'US News 2024 Best Engineering Graduate Schools');

const utdMapper = (row) => {
  if (row.university === 'University of Texas at Dallas' && row.rank === 999) return 44;
};
update('r1-bschool-schools.json', utdMapper, 'UT Dallas → US News 2024 Best Business Schools rank 44');
update('r1-bschool-bsq.json', (row) => {
  if (row.university === 'University of Texas at Dallas' && row.rank === 999) {
    row.tier = 'US News 2024 Best Business Schools';
    return 44;
  }
}, 'UT Dallas tier + rank');

console.log('Done.');
