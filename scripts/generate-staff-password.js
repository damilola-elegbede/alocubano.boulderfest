#!/usr/bin/env node
import bcrypt from 'bcryptjs';
import { createInterface } from 'readline';

/**
 * Generate bcrypt hash for check-in staff password
 * Uses environment variable or prompts for password input
 */
async function generateStaffPasswordHash() {
  let staffPassword = process.env.CHECKIN_STAFF_PLAINTEXT_PASSWORD;
  
  // If no environment variable, prompt for password
  if (!staffPassword) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    staffPassword = await new Promise((resolve) => {
      rl.question('Enter check-in staff password: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }
  
  if (!staffPassword) {
    console.error('❌ No password provided');
    process.exit(1);
  }
  
  const saltRounds = 10;
  
  try {
    const hash = await bcrypt.hash(staffPassword, saltRounds);
    
    console.log('Check-in Staff Password Configuration');
    console.log('=====================================');
    console.log('Password: [SECURED - NOT DISPLAYED]');
    console.log('');
    console.log('Add this to your .env file:');
    console.log('CHECKIN_STAFF_PASSWORD=' + hash);
    console.log('');
    console.log('For 72-hour mobile sessions:');
    console.log('MOBILE_CHECKIN_SESSION_DURATION=259200000');
    console.log('');
    console.log('✅ Staff password hash generated successfully');
    
    // Verify it works
    const isValid = await bcrypt.compare(staffPassword, hash);
    if (isValid) {
      console.log('✅ Hash verification successful');
    } else {
      console.error('❌ Hash verification failed');
    }
    
    return hash;
  } catch (error) {
    console.error('Error generating hash:', error);
    process.exit(1);
  }
}

generateStaffPasswordHash();