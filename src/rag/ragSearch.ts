import { pool } from '../db.js';
import { generateEmbedding } from './embeddingService.js';

export async function performRAGSearch(userQuery: string) {
  // Convert the user's spoken query into a vector
  console.log("Query ->", userQuery)
  const embedding = await generateEmbedding(userQuery);

  // Query pgvector for the top 3 most relevant policy segments
  // const query = `
  //   SELECT content, metadata
  //   FROM knowledge_base
  //   ORDER BY embedding <=> $1::vector
  //   LIMIT 3;
  // `;

  // const { rows } = await pool.query(query, [JSON.stringify(embedding)]);

  // // Return a combined string
  // return rows.map(r => r.content).join("\n---\n");

  return `Code of Conduct Polic Defines expected employee behavior, professionalism, ethics,
          respect, and workplace standard  Anti-Discrimination and Harassment Polic Prohibits
          discrimination, harassment, bullying, and retaliation. Ensures equal opportunity for
          all employee  Attendance and Punctuality Polic Outlines work hours, attendance
          expectations, tardiness rules, and absence reporting procedure  Leave Polic Explains
          types of leave such as annual leave, sick leave, maternity/paternity leave, unpaid
          leave, and public holiday  Remote Work / Work From Home Polic Defines eligibility,
          expectations, work hours, communication standards, and equipment responsibilitie
          Compensation and Payroll Polic Covers salary structure, payment schedule, overtime,
          bonuses, and deduction  Performance Evaluation Polic Describes performance review
          process, appraisal timelines, promotions, and improvement plan  Disciplinary Polic
          Outlines procedures for handling misconduct, warnings, suspension, and terminatio
          IT and Acceptable Use Polic Explains proper use of company computers, email, internet,
          software, and data security requirement Data Protection and Privacy Polic  Defines
          how company and customer data must be handled, stored, and protecte Confidentiality
          and Non-Disclosure Polic  Requires employees to protect sensitive company informatio
          Health and Safety Polic  Ensures a safe work environment and outlines emergency procedure
          Conflict of Interest Polic  Prevents employees from engaging in activities that conflict
          with company interest Social Media Polic  Guidelines for employee behavior on social media
          regarding company representatio Whistleblower Polic  Provides a safe way to report
          unethical or illegal behavio Travel and Expense Polic  Explains reimbursement rules,
          approvals, and expense limit Training and Development Polic  Outlines employee training
          programs and professional development opportunitie Equal Opportunity Employment Polic
          Ensures fair hiring, promotion, and workplace practices.`;
}
