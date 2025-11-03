import csv

def read_and_format_csv(file_path):
    formatted_items = []

    with open(file_path, mode='r', newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            if row:
                # Remove surrounding quotes if present and strip whitespace
                value = row[0].strip().strip('"').strip("'")
                formatted_items.append(f"'{value}'")

    result = ','.join(formatted_items)
    return result

# Example usage
csv_file = './data/detroit_active.csv'  # Replace with your CSV file path
output = read_and_format_csv(csv_file)
print(output)
